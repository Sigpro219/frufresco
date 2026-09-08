'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney } from '@/lib/adminTheme';
import { 
    MessageSquare, AlertTriangle, CheckCircle2, Clock, Search, 
    Building2, User, Calendar, Plus, Trash2, Loader2, ArrowRight,
    Play, Eye, CornerDownRight, FileText, Camera, Truck, BarChart2,
    ShieldAlert, AlertCircle, Sparkles, HelpCircle, Check, ShieldCheck,
    HeartHandshake, TrendingUp, Layers, Store, Warehouse, PackageCheck,
    Zap, ChevronRight, ChevronDown, ChevronUp, RotateCcw, ExternalLink, CameraOff, Upload,
    Maximize2, Phone, Mail, MessageCircle, UserCheck, X, Scale, Receipt,
    PackageMinus, Inbox, Edit2
} from 'lucide-react';
import Link from 'next/link';
import RoleProcessGuide from '@/components/common/RoleProcessGuide';
import ProcessTooltip from '@/components/common/ProcessTooltip';
import { 
    RCA_CATEGORIES_L1, 
    RESPONSIBLE_PARTIES, 
    parseRcaFromRecord, 
    buildRcaMetadataTag 
} from '@/lib/rcaTaxonomy';

// Helpers for visual storytelling and scanning
const getClientInitials = (name?: string): string => {
    if (!name) return 'CL';
    const clean = name.trim();
    const parts = clean.split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
};

const getTypeBadgeStyle = (type: string) => {
    switch (type) {
        case 'reclamo':
            return { bg: '#FFE4E6', text: '#BE123C', border: '#FECDD3', label: 'Reclamo' };
        case 'peticion':
            return { bg: '#E0F2FE', text: '#0369A1', border: '#BAE6FD', label: 'Petición' };
        case 'queja':
            return { bg: '#FEF3C7', text: '#B45309', border: '#FDE68A', label: 'Queja' };
        case 'felicitacion':
            return { bg: '#DCFCE7', text: '#15803D', border: '#BBF7D0', label: 'Felicitación' };
        case 'sugerencia':
            return { bg: '#F3E8FF', text: '#7E22CE', border: '#E9D5FF', label: 'Sugerencia' };
        default:
            return { bg: '#F1F5F9', text: '#475569', border: '#E2E8F0', label: type };
    }
};

const getResponsibleIcon = (code: string) => {
    switch (code) {
        case 'proveedor':
            return <Store size={12} />;
        case 'bodega':
            return <Warehouse size={12} />;
        case 'picking':
            return <Layers size={12} />;
        case 'transporte':
            return <Truck size={12} />;
        case 'comercial':
            return <User size={12} />;
        case 'cliente':
            return <Building2 size={12} />;
        default:
            return <HelpCircle size={12} />;
    }
};

const formatDateFriendly = (dateStr: string): string => {
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
    } catch {
        return dateStr;
    }
};

// Helper to sanitize and validate Colombian mobile numbers for WhatsApp
export const cleanColombianPhone = (phoneRaw?: string | null): { display: string; waNumber: string; isValid: boolean } => {
    if (!phoneRaw) return { display: '', waNumber: '', isValid: false };
    const digits = phoneRaw.replace(/\D/g, '');
    
    // If starts with 57 and has 12 digits (573001234567)
    if (digits.startsWith('57') && digits.length === 12 && digits[2] === '3') {
        const local = digits.substring(2);
        return { display: local, waNumber: digits, isValid: true };
    }
    
    // Standard 10-digit mobile starting with 3 (e.g. 3154456827)
    if (digits.length === 10 && digits.startsWith('3')) {
        return { display: digits, waNumber: `57${digits}`, isValid: true };
    }

    // Landline or generic number with 7+ digits
    if (digits.length >= 7) {
        return { display: digits, waNumber: `57${digits}`, isValid: digits.length === 10 && digits.startsWith('3') };
    }
    
    return { display: '', waNumber: '', isValid: false };
};

// Safe helper to extract and clean photo URLs from PQR record
export const getPqrPhotos = (p: PQR | null | undefined): string[] => {
    if (!p) return [];
    const photos: string[] = [];
    if (p.primary_photo_url && typeof p.primary_photo_url === 'string' && p.primary_photo_url.trim().length > 0) {
        photos.push(p.primary_photo_url.trim());
    }
    if (Array.isArray(p.additional_photos)) {
        p.additional_photos.forEach(url => {
            if (url && typeof url === 'string' && url.trim().length > 0 && !photos.includes(url.trim())) {
                photos.push(url.trim());
            }
        });
    }
    return photos;
};

export interface PqrAuthorInfo {
    channel: 'portal_b2b' | 'portal_b2c' | 'conductor' | 'mesa_ayuda';
    channelLabel: string;
    channelBadgeColor: string;
    channelBadgeBg: string;
    channelBadgeBorder: string;
    authorTitle: string;
    authorName: string;
    authorRole: string;
    authorInitials: string;
    receptionChannel: string;
    companyName: string;
    clientContact: string;
    nit: string;
    email: string;
    phone: string;
    cleanPhone: string;
    isPhoneValid: boolean;
    isDriver: boolean;
    isClient: boolean;
}

export const getPqrAuthorInfo = (p: PQR): PqrAuthorInfo => {
    const subject = p.subject || '';
    const desc = p.description || '';
    const company = p.profiles?.company_name || 'Empresa No Especificada';
    const contact = p.profiles?.contact_name || 'Ecónomo / Contacto en Sitio';
    const nit = p.profiles?.nit || '';
    const email = p.profiles?.email || '';
    const rawPhone = p.profiles?.contact_phone || p.profiles?.phone || '';
    const phoneParsed = cleanColombianPhone(rawPhone);

    // 1. If submitted via Driver App in delivery route
    if (subject.startsWith('[Conductor]') || desc.includes('El conductor reportó') || desc.includes('Cancelación total reportada por conductor')) {
        return {
            channel: 'conductor',
            channelLabel: 'App Móvil Conductor',
            channelBadgeColor: '#1D4ED8',
            channelBadgeBg: '#EFF6FF',
            channelBadgeBorder: '#BFDBFE',
            authorTitle: 'Novedad Reportada en Entrega Física',
            authorName: 'Conductor Asignado en Ruta',
            authorRole: 'Transportista de Última Milla — Logística FruFresco',
            authorInitials: 'TR',
            receptionChannel: 'App Móvil Conductor (Novedad en Sitio de Entrega)',
            companyName: company,
            clientContact: contact,
            nit,
            email,
            phone: phoneParsed.display || rawPhone,
            cleanPhone: phoneParsed.waNumber,
            isPhoneValid: phoneParsed.isValid,
            isDriver: true,
            isClient: false
        };
    }

    // 2. If submitted by B2B Institutional Client (Self-Service or Order Novelty)
    if (p.profiles?.role === 'b2b_client' || subject.startsWith('[Portal B2B]') || desc.includes('Reporte de autoservicio B2B')) {
        const clientDisplayName = contact && contact !== 'Ecónomo / Contacto en Sitio' && contact !== company ? contact : company;
        return {
            channel: 'portal_b2b',
            channelLabel: 'Portal Autogestión B2B',
            channelBadgeColor: '#047857',
            channelBadgeBg: '#ECFDF5',
            channelBadgeBorder: '#A7F3D0',
            authorTitle: 'Radicado Directamente por Cliente B2B',
            authorName: clientDisplayName,
            authorRole: `Ecónomo / Encargado de Compras (${company})`,
            authorInitials: getClientInitials(company),
            receptionChannel: 'Portal Institucional B2B (Radicación Digital Autogestión)',
            companyName: company,
            clientContact: contact,
            nit,
            email,
            phone: phoneParsed.display || rawPhone,
            cleanPhone: phoneParsed.waNumber,
            isPhoneValid: phoneParsed.isValid,
            isDriver: false,
            isClient: true
        };
    }

    // 3. If submitted by B2C Final Consumer Client
    if (p.profiles?.role === 'b2c_client' || p.profiles?.role === 'client') {
        const b2cName = contact || company || 'Cliente Consumidor Final';
        return {
            channel: 'portal_b2c',
            channelLabel: 'Tienda Online B2C',
            channelBadgeColor: '#2563EB',
            channelBadgeBg: '#EFF6FF',
            channelBadgeBorder: '#BFDBFE',
            authorTitle: 'Radicado por Cliente B2C (Tienda Online)',
            authorName: b2cName,
            authorRole: 'Cliente Consumidor Final (E-Commerce FruFresco)',
            authorInitials: getClientInitials(b2cName),
            receptionChannel: 'Tienda Web E-Commerce B2C (Autogestión)',
            companyName: company,
            clientContact: contact,
            nit,
            email,
            phone: phoneParsed.display || rawPhone,
            cleanPhone: phoneParsed.waNumber,
            isPhoneValid: phoneParsed.isValid,
            isDriver: false,
            isClient: true
        };
    }

    // 4. Internal FruFresco Staff / Customer Service Desk
    return {
        channel: 'mesa_ayuda',
        channelLabel: 'Mesa de Ayuda SAC',
        channelBadgeColor: '#7C3AED',
        channelBadgeBg: '#F3E8FF',
        channelBadgeBorder: '#DDD6FE',
        authorTitle: 'Radicado Internamente en Mesa SAC',
        authorName: 'Mesa de Experiencia FruFresco',
        authorRole: 'Gestión de Atención al Cliente & Calidad FruFresco',
        authorInitials: 'SAC',
        receptionChannel: 'Llamada Telefónica / WhatsApp Directo SAC',
        companyName: company,
        clientContact: contact,
        nit,
        email,
        phone: phoneParsed.display || rawPhone,
        cleanPhone: phoneParsed.waNumber,
        isPhoneValid: phoneParsed.isValid,
        isDriver: false,
        isClient: false
    };
};

interface PQR {
    id: string;
    client_id: string;
    order_id: string | null;
    type: 'queja' | 'reclamo' | 'peticion' | 'sugerencia' | 'felicitacion';
    category: 'producto' | 'entrega' | 'facturacion' | 'otro';
    subject: string;
    description: string;
    primary_photo_url: string | null;
    additional_photos: string[] | null;
    status: 'pending' | 'in_progress' | 'resolved' | 'rejected';
    priority: 'low' | 'normal' | 'high' | 'urgent';
    created_at: string;
    resolved_at: string | null;
    resolution_notes: string | null;
    defect_category_l1?: string | null;
    defect_subtype_l2?: string | null;
    imputed_responsible?: string | null;
    imputation_evidence_notes?: string | null;
    is_replacement_rejection?: boolean | null;
    profiles?: {
        id?: string;
        company_name: string;
        contact_name: string;
        role: string;
        nit: string;
        email?: string;
        phone?: string;
        contact_phone?: string;
        corporate_role?: string;
    } | null;
    orders?: {
        sequence_id: number;
        total: number;
        created_at: string;
        origin_source?: string;
        admin_notes?: string;
        shipping_address?: string;
    } | null;
}

export default function CustomerServicePage() {
    const [pqrs, setPqrs] = useState<PQR[]>([]);
    const [novelties, setNovelties] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'pending' | 'resolved' | 'novelties'>('pending');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'in_progress' | 'resolved' | 'rejected'>('all');
    const [noveltyStatusFilter, setNoveltyStatusFilter] = useState<'all' | 'pending_review' | 'approved' | 'rejected'>('all');
    const rightPanelRef = useRef<HTMLDivElement>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPqr, setSelectedPqr] = useState<PQR | null>(null);
    const [selectedNovelty, setSelectedNovelty] = useState<any | null>(null);
    const [resolutionNotes, setResolutionNotes] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [resolutionOption, setResolutionOption] = useState<'opt1' | 'opt2' | 'opt3' | 'opt4'>('opt1');

    // RCA Form State
    const [rcaCategoryL1, setRcaCategoryL1] = useState('dano_mecanico');
    const [rcaSubtypeL2, setRcaSubtypeL2] = useState('aplastamiento_sobreestiba');
    const [rcaResponsible, setRcaResponsible] = useState<'proveedor' | 'bodega' | 'picking' | 'transporte' | 'comercial' | 'cliente'>('transporte');
    const [rcaEvidenceNotes, setRcaEvidenceNotes] = useState('');

    // Toast feedback state
    const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null);

    // Carousel & Photo Modal state
    const [activePhotoIdx, setActivePhotoIdx] = useState(0);
    const [zoomPhotoUrl, setZoomPhotoUrl] = useState<string | null>(null);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Novelty creation state (for product-related PQRs with orders)
    const [orderItems, setOrderItems] = useState<any[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [selectedItemId, setSelectedItemId] = useState('');
    const [noveltyQty, setNoveltyQty] = useState(0);
    const [noveltyType, setNoveltyType] = useState<'faltante' | 'averia'>('faltante');
    const [noveltyReason, setNoveltyReason] = useState('');

    // Phone management state for quick WhatsApp reachability
    const [editingPhoneProfileId, setEditingPhoneProfileId] = useState<string | null>(null);
    const [newPhoneInput, setNewPhoneInput] = useState('');
    const [savingPhone, setSavingPhone] = useState(false);

    // Sticky header & KPI collapse state
    const [showKpis, setShowKpis] = useState(true);
    const kpiHeaderRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const saved = localStorage.getItem('cs_show_kpis');
        if (saved !== null) {
            setShowKpis(saved === 'true');
        }
    }, []);

    const toggleShowKpis = () => {
        setShowKpis(prev => {
            const next = !prev;
            localStorage.setItem('cs_show_kpis', String(next));
            return next;
        });
    };

    const showToast = (text: string, type: 'success' | 'error' | 'warning' = 'success') => {
        setToastMessage({ text, type });
        setTimeout(() => {
            setToastMessage(null);
        }, 4000);
    };

    const handleSavePhone = async (profileId: string) => {
        const clean = newPhoneInput.replace(/\D/g, '');
        if (clean.length < 10) {
            showToast('Ingresa un número celular válido de 10 dígitos (ej: 3154456827)', 'warning');
            return;
        }
        setSavingPhone(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ contact_phone: clean, phone: clean })
                .eq('id', profileId);
            if (error) throw error;

            // Update local state in pqrs
            setPqrs(prev => prev.map(p => {
                if (p.client_id === profileId && p.profiles) {
                    return {
                        ...p,
                        profiles: {
                            ...p.profiles,
                            phone: clean,
                            contact_phone: clean
                        }
                    };
                }
                return p;
            }));

            // Update selectedPqr if currently open
            if (selectedPqr && selectedPqr.client_id === profileId && selectedPqr.profiles) {
                setSelectedPqr({
                    ...selectedPqr,
                    profiles: {
                        ...selectedPqr.profiles,
                        phone: clean,
                        contact_phone: clean
                    }
                });
            }

            // Update novelties if matches
            setNovelties(prev => prev.map(n => {
                if (n.orders?.profiles && (n.orders.profiles as any).id === profileId) {
                    return {
                        ...n,
                        orders: {
                            ...n.orders,
                            profiles: {
                                ...n.orders.profiles,
                                phone: clean,
                                contact_phone: clean
                            }
                        }
                    };
                }
                return n;
            }));

            setEditingPhoneProfileId(null);
            setNewPhoneInput('');
            showToast('Número de WhatsApp registrado con éxito en la cuenta del cliente.', 'success');
        } catch (err: any) {
            console.error('Error saving phone:', err);
            showToast('Error al guardar el teléfono: ' + (err.message || 'Error desconocido'), 'error');
        } finally {
            setSavingPhone(false);
        }
    };

    const handleUploadEvidence = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedPqr) return;

        setUploadingPhoto(true);
        try {
            const fileExt = file.name.split('.').pop() || 'jpg';
            const fileName = `pqr-${selectedPqr.id}-${Date.now()}.${fileExt}`;

            const { error: uploadErr } = await supabase.storage
                .from('product-images')
                .upload(fileName, file, { contentType: file.type, upsert: true });

            if (uploadErr) throw uploadErr;

            const { data: { publicUrl } } = supabase.storage
                .from('product-images')
                .getPublicUrl(fileName);

            const newPrimary = selectedPqr.primary_photo_url ? selectedPqr.primary_photo_url : publicUrl;
            const newAdditional = selectedPqr.primary_photo_url 
                ? [...(selectedPqr.additional_photos || []), publicUrl]
                : (selectedPqr.additional_photos || []);

            const { error: updateErr } = await supabase
                .from('customer_service_pqrs')
                .update({
                    primary_photo_url: newPrimary,
                    additional_photos: newAdditional
                })
                .eq('id', selectedPqr.id);

            if (updateErr) throw updateErr;

            const updatedPqr: PQR = {
                ...selectedPqr,
                primary_photo_url: newPrimary,
                additional_photos: newAdditional
            };
            setSelectedPqr(updatedPqr);
            setPqrs(prev => prev.map(p => p.id === selectedPqr.id ? updatedPqr : p));
            showToast('Foto de evidencia adjuntada con éxito al caso.', 'success');
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (err: any) {
            console.error('Error subiendo foto:', err);
            showToast('Error al subir foto de evidencia: ' + (err.message || 'Error desconocido'), 'error');
        } finally {
            setUploadingPhoto(false);
        }
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Fetch PQRs with complete profile contact data
            const { data: pqrsData, error: pqrsError } = await supabase
                .from('customer_service_pqrs')
                .select(`
                    *,
                    profiles:client_id(id, company_name, contact_name, role, nit, email, phone, contact_phone, corporate_role),
                    orders:order_id(sequence_id, total, created_at, origin_source, admin_notes, shipping_address)
                `)
                .order('created_at', { ascending: false });

            if (pqrsError) throw pqrsError;
            setPqrs(pqrsData || []);

            // 2. Fetch Billing Returns (Novelties)
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
                        profiles(id, company_name, contact_name, role, nit, phone, contact_phone)
                    )
                `)
                .order('created_at', { ascending: false });

            if (returnsError) throw returnsError;
            setNovelties(returnsData || []);
        } catch (e: any) {
            console.error('Error fetching PQRs/novelties:', e);
            showToast('Error cargando datos: ' + e.message, 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handlePqrSelect = async (pqr: PQR) => {
        setSelectedPqr(pqr);
        setResolutionNotes(pqr.resolution_notes || '');
        setActivePhotoIdx(0);
        setSelectedItemId('');
        setNoveltyQty(0);
        setNoveltyReason('');
        if (rightPanelRef.current) {
            rightPanelRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
        if (typeof window !== 'undefined' && window.scrollY < 120 && showKpis) {
            window.scrollTo({ top: 160, behavior: 'smooth' });
        }

        // Parse RCA metadata from record
        const rca = parseRcaFromRecord(pqr);
        setRcaCategoryL1(rca.categoryL1 || 'dano_mecanico');
        setRcaSubtypeL2(rca.subtypeL2 || '');
        setRcaResponsible((rca.responsible !== 'no_definido' ? rca.responsible : 'transporte') as any);
        setRcaEvidenceNotes(rca.notes || '');

        // If it's a replacement rejection, default to opt3 (Credit Note) to avoid ping-pong
        const isReplacement = rca.isReplacementRejection || 
            (pqr.subject || '').includes('[ALERTA PING-PONG]') || 
            (pqr.description || '').includes('ALERTA CORTE DE BUCLE');

        setResolutionOption(isReplacement ? 'opt3' : 'opt1');

        // If PQR has an associated order, load its items to allow registering novelties
        if (pqr.order_id) {
            setLoadingItems(true);
            try {
                const { data, error } = await supabase
                    .from('order_items')
                    .select(`
                        *,
                        products(name, sku, unit_of_measure)
                    `)
                    .eq('order_id', pqr.order_id);
                if (error) throw error;
                setOrderItems(data || []);
            } catch (e) {
                console.error('Error fetching order items:', e);
            } finally {
                setLoadingItems(false);
            }
        } else {
            setOrderItems([]);
        }
    };

    // Update PQR Status / Resolution with Option Concept & RCA Tracking
    const handleResolvePqr = async (status: 'resolved' | 'rejected') => {
        if (!selectedPqr || !resolutionNotes.trim()) {
            showToast('Por favor, ingresa una nota de resolución antes de guardar.', 'warning');
            return;
        }

        const rcaParsed = parseRcaFromRecord(selectedPqr);
        const isReplacementRejection = rcaParsed.isReplacementRejection || 
            (selectedPqr.subject || '').includes('[ALERTA PING-PONG]') || 
            (selectedPqr.description || '').includes('ALERTA CORTE DE BUCLE');

        // Poka-Yoke Corte de Bucle (Re-rechazo en Reposición)
        if (status === 'resolved' && resolutionOption === 'opt2' && isReplacementRejection) {
            showToast('⚠️ BLOQUEADO POR REGLA DE CORTE DE BUCLE: No es posible reprogramar un tercer flete de un producto ya devuelto dos veces. Debe liquidarse como Nota Crédito (Opción 3) o Ajustar Factura (Opción 4).', 'error');
            return;
        }

        setActionLoading(true);
        try {
            let finalNotes = resolutionNotes;
            let redirectUrl = null;

            if (status === 'resolved') {
                if (resolutionOption === 'opt1') {
                    finalNotes = `${resolutionNotes}\n\n[CONCEPTO: Cerrado sin cambios en factura (Entregado Conforme)]`;
                } else if (resolutionOption === 'opt2') {
                    if (!selectedPqr.order_id) {
                        showToast('Esta PQR no tiene un pedido asociado para reprogramar reposición.', 'warning');
                        setActionLoading(false);
                        return;
                    }

                    // Fetch original order details
                    const { data: originalOrder, error: orderErr } = await supabase
                        .from('orders')
                        .select('*')
                        .eq('id', selectedPqr.order_id)
                        .single();

                    if (orderErr || !originalOrder) {
                        throw new Error('No se pudo cargar el pedido original.');
                    }

                    // Fetch pending returns for this order to see if it is partial or total
                    const { data: pendingReturns, error: returnsError } = await supabase
                        .from('billing_returns')
                        .select('*')
                        .eq('order_id', selectedPqr.order_id)
                        .eq('status', 'pending_review');

                    if (returnsError) {
                        throw new Error(`Error consultando devoluciones pendientes: ${returnsError.message}`);
                    }

                    // Copy items
                    const { data: originalItems, error: itemsErr } = await supabase
                        .from('order_items')
                        .select('*')
                        .eq('order_id', selectedPqr.order_id);

                    if (itemsErr) {
                        throw new Error('No se pudieron cargar los productos del pedido original.');
                    }

                    let itemsToReprogram: any[] = [];
                    let isPartial = false;

                    if (pendingReturns && pendingReturns.length > 0) {
                        isPartial = true;
                        pendingReturns.forEach(ret => {
                            const matchedItem = originalItems?.find(item => item.product_id === ret.product_id);
                            if (matchedItem) {
                                itemsToReprogram.push({
                                    product_id: ret.product_id,
                                    quantity: ret.quantity_returned,
                                    unit_price: matchedItem.unit_price,
                                    nickname: matchedItem.nickname,
                                    selected_options: matchedItem.selected_options,
                                    variant_label: matchedItem.variant_label
                                });
                            }
                        });
                    }

                    // POKA-YOKE: If no returns registered, do NOT accidentally clone 100% of order unless confirmed
                    if (itemsToReprogram.length === 0) {
                        const confirmTotal = window.confirm(
                            '⚠️ ATENCIÓN: No hay productos específicos devueltos registrados en el panel derecho.\n\n¿Estás seguro de que deseas reprogramar el 100% de TODOS los productos del pedido original?'
                        );
                        if (!confirmTotal) {
                            setActionLoading(false);
                            return;
                        }

                        isPartial = false;
                        itemsToReprogram = (originalItems || []).map(item => ({
                            product_id: item.product_id,
                            quantity: item.quantity,
                            unit_price: item.unit_price,
                            nickname: item.nickname,
                            selected_options: item.selected_options,
                            variant_label: item.variant_label
                        }));
                    }

                    // Calculate total and subtotal for the new order based on the reprogrammed items
                    const newTotal = itemsToReprogram.reduce((acc, item) => acc + (item.quantity * item.unit_price), 0);

                    // Create new order record (D+1)
                    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
                    const { data: newOrder, error: newOrderErr } = await supabase
                        .from('orders')
                        .insert([{
                            profile_id: originalOrder.profile_id,
                            type: originalOrder.type,
                            status: 'draft',
                            origin_source: 'customer_service',
                            delivery_date: tomorrow,
                            delivery_slot: originalOrder.delivery_slot || 'AM',
                            shipping_address: originalOrder.shipping_address,
                            latitude: originalOrder.latitude,
                            longitude: originalOrder.longitude,
                            total: newTotal,
                            subtotal: newTotal,
                            total_weight_kg: 0,
                            admin_notes: `[REPOSICIÓN DE PEDIDO - RECHAZO ${isPartial ? 'PARCIAL' : 'TOTAL'}] Generado automáticamente por PQR del Pedido original #${originalOrder.sequence_id}.\n\nNotas PQR: ${resolutionNotes}`
                        }])
                        .select()
                        .single();

                    if (newOrderErr || !newOrder) {
                        throw new Error(`Error creando pedido de reposición: ${newOrderErr?.message}`);
                    }

                    const itemsWithOrderId = itemsToReprogram.map(item => ({
                        ...item,
                        order_id: newOrder.id
                    }));

                    const { error: insertItemsErr } = await supabase
                        .from('order_items')
                        .insert(itemsWithOrderId);

                    if (insertItemsErr) {
                        throw new Error(`Error copiando artículos del pedido: ${insertItemsErr.message}`);
                    }

                    if (isPartial) {
                        for (const novelty of pendingReturns) {
                            await supabase
                                .from('billing_returns')
                                .update({ status: 'approved', reason: `${novelty.reason} - Reprogramado en Pedido #${newOrder.sequence_id}` })
                                .eq('id', novelty.id);
                        }
                    }

                    finalNotes = `${resolutionNotes}\n\n[CONCEPTO: Opción 2 - Reprogramar reposición (${isPartial ? 'Rechazo Parcial' : 'Rechazo Total'})]\n-> Nuevo pedido de reposición generado con folio #${newOrder.sequence_id}`;
                    redirectUrl = `/admin/orders/${newOrder.id}`;

                } else if (resolutionOption === 'opt3') {
                    finalNotes = `${resolutionNotes}\n\n[CONCEPTO: Opción 3 - Generar Nota Crédito (Remitir novedad a facturación)]`;

                } else if (resolutionOption === 'opt4') {
                    if (!selectedPqr.order_id) {
                        showToast('Esta PQR no tiene un pedido asociado para cerrar con cantidad recibida.', 'warning');
                        setActionLoading(false);
                        return;
                    }

                    const { data: pendingReturns, error: returnsError } = await supabase
                        .from('billing_returns')
                        .select('*')
                        .eq('order_id', selectedPqr.order_id)
                        .eq('status', 'pending_review');

                    if (returnsError) {
                        throw new Error(`Error consultando devoluciones pendientes: ${returnsError.message}`);
                    }

                    if (!pendingReturns || pendingReturns.length === 0) {
                        showToast('No se encontraron novedades de producto pendientes registradas para este pedido. Registra primero la cantidad devuelta/faltante a la derecha.', 'warning');
                        setActionLoading(false);
                        return;
                    }

                    for (const novelty of pendingReturns) {
                        const { data: itemData, error: itemError } = await supabase
                            .from('order_items')
                            .select('unit_price, quantity')
                            .eq('order_id', novelty.order_id)
                            .eq('product_id', novelty.product_id)
                            .single();
                        
                        if (itemError) continue;

                        const newQty = Math.max(0, Number(itemData.quantity) - Number(novelty.quantity_returned));
                        const priceCredit = Number(novelty.quantity_returned) * Number(itemData.unit_price);

                        await supabase
                            .from('order_items')
                            .update({ quantity: newQty })
                            .eq('order_id', novelty.order_id)
                            .eq('product_id', novelty.product_id);

                        const { data: orderData } = await supabase.from('orders').select('total').eq('id', novelty.order_id).single();
                        const newTotal = Math.max(0, (Number(orderData?.total) || 0) - priceCredit);
                        
                        await supabase
                            .from('orders')
                            .update({ total: newTotal })
                            .eq('id', novelty.order_id);

                        const { data: invoiceData } = await supabase.from('billing_invoices').select('id, order_id').eq('order_id', novelty.order_id).single();
                        if (invoiceData) {
                            const { data: orderProf } = await supabase
                                .from('orders')
                                .select('profiles(iva_responsible)')
                                .eq('id', novelty.order_id)
                                .single();
                            const isIva = (orderProf as any)?.profiles?.iva_responsible || false;
                            const totalBase = isIva ? newTotal / 1.19 : newTotal;
                            const totalTax = isIva ? newTotal - totalBase : 0;

                            await supabase
                                .from('billing_invoices')
                                .update({
                                    total_base: totalBase,
                                    total_tax: totalTax,
                                    total_final: newTotal
                                })
                                .eq('id', invoiceData.id);
                        }

                        await supabase
                            .from('billing_returns')
                            .update({ status: 'approved' })
                            .eq('id', novelty.id);
                    }

                    finalNotes = `${resolutionNotes}\n\n[CONCEPTO: Opción 4 - Cerrar pedido con cantidad real recibida]\n-> Novedades aprobadas y total recalculado automáticamente en facturación.`;
                }
            } else {
                finalNotes = `${resolutionNotes}\n\n[CASO RECHAZADO / ARCHIVADO]`;
            }

            // Append structured RCA metadata tag
            const rcaTag = buildRcaMetadataTag({
                categoryL1: rcaCategoryL1,
                subtypeL2: rcaSubtypeL2,
                responsible: rcaResponsible,
                notes: rcaEvidenceNotes,
                isReplacementRejection: isReplacementRejection
            });
            const responsibleLabel = RESPONSIBLE_PARTIES[rcaResponsible]?.label || rcaResponsible;
            finalNotes = `${finalNotes}\n\n${rcaTag}\n[RESPONSABLE IMPUTADO (RCA): ${responsibleLabel}]`;

            const { error } = await supabase
                .from('customer_service_pqrs')
                .update({
                    status: status,
                    resolution_notes: finalNotes,
                    resolved_at: new Date().toISOString()
                })
                .eq('id', selectedPqr.id);

            if (error) throw error;

            showToast(`✅ PQR cerrada con éxito (${status === 'resolved' ? 'Resuelta' : 'Rechazada'}).`, 'success');
            fetchData();

            if (redirectUrl) {
                setTimeout(() => {
                    window.location.href = redirectUrl;
                }, 1200);
            }
        } catch (e: any) {
            console.error('Error resolving PQR:', e);
            showToast('Error al procesar la resolución de PQR: ' + e.message, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    // Keyboard-First shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';

            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                if (selectedPqr && selectedPqr.status === 'pending' && !actionLoading) {
                    handleResolvePqr('resolved');
                }
                return;
            }

            if (!isTyping && selectedPqr && selectedPqr.status === 'pending') {
                if (e.key === '1') setResolutionOption('opt1');
                else if (e.key === '2') setResolutionOption('opt2');
                else if (e.key === '3') setResolutionOption('opt3');
                else if (e.key === '4') setResolutionOption('opt4');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedPqr, resolutionNotes, resolutionOption, actionLoading, rcaCategoryL1, rcaSubtypeL2, rcaResponsible]);

    const handleCreateNovelty = async () => {
        if (!selectedPqr?.order_id || !selectedItemId || noveltyQty <= 0) {
            showToast('Por favor, completa todos los campos de la novedad.', 'warning');
            return;
        }

        setActionLoading(true);
        try {
            const selectedItem = orderItems.find(i => i.id === selectedItemId);
            if (!selectedItem) throw new Error('Artículo no encontrado en el pedido.');

            if (noveltyQty > selectedItem.quantity) {
                showToast(`La cantidad no puede superar la cantidad despachada original (${selectedItem.quantity}).`, 'warning');
                setActionLoading(false);
                return;
            }

            const { error: returnErr } = await supabase
                .from('billing_returns')
                .insert([{
                    order_id: selectedPqr.order_id,
                    product_id: selectedItem.product_id,
                    quantity_returned: noveltyQty,
                    reason: noveltyReason || `Novedad de PQR: ${selectedPqr.subject}`,
                    status: 'pending_review'
                }]);

            if (returnErr) throw returnErr;

            showToast('✅ Novedad registrada para cobro y cartera.', 'success');
            setSelectedItemId('');
            setNoveltyQty(0);
            setNoveltyReason('');
            fetchData();
        } catch (e: any) {
            showToast('Error al registrar novedad: ' + e.message, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const getPqrPhotos = (pqr: PQR) => {
        const list: string[] = [];
        if (pqr.primary_photo_url) list.push(pqr.primary_photo_url);
        if (pqr.additional_photos && Array.isArray(pqr.additional_photos)) {
            list.push(...pqr.additional_photos);
        }
        return list;
    };

    const pqrCounts = {
        all: pqrs.length,
        pending: pqrs.filter(p => p.status === 'pending').length,
        in_progress: pqrs.filter(p => p.status === 'in_progress').length,
        resolved: pqrs.filter(p => p.status === 'resolved').length,
        rejected: pqrs.filter(p => p.status === 'rejected').length,
    };

    const noveltyCounts = {
        all: novelties.length,
        pending_review: novelties.filter(n => n.status === 'pending_review').length,
        approved: novelties.filter(n => n.status === 'approved').length,
        rejected: novelties.filter(n => n.status === 'rejected').length,
    };

    const filteredPqrs = pqrs.filter(p => {
        // Status filter matching
        if (statusFilter === 'pending' && p.status !== 'pending') return false;
        if (statusFilter === 'in_progress' && p.status !== 'in_progress') return false;
        if (statusFilter === 'resolved' && p.status !== 'resolved') return false;
        if (statusFilter === 'rejected' && p.status !== 'rejected') return false;

        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            p.subject.toLowerCase().includes(term) ||
            p.description.toLowerCase().includes(term) ||
            (p.profiles?.company_name || '').toLowerCase().includes(term) ||
            (p.profiles?.contact_name || '').toLowerCase().includes(term) ||
            (p.orders?.sequence_id ? `#${p.orders.sequence_id}`.includes(term) : false)
        );
    });

    const filteredNovelties = novelties.filter(n => {
        if (noveltyStatusFilter !== 'all' && n.status !== noveltyStatusFilter) {
            return false;
        }

        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            (n.products?.name || '').toLowerCase().includes(term) ||
            (n.reason || '').toLowerCase().includes(term) ||
            (n.orders?.profiles?.company_name || '').toLowerCase().includes(term) ||
            (n.orders?.profiles?.contact_name || '').toLowerCase().includes(term) ||
            (n.orders?.sequence_id ? `#${n.orders.sequence_id}`.includes(term) : false)
        );
    });

    const handleProcessNovelty = async (novelty: any, decision: 'approved' | 'rejected') => {
        setActionLoading(true);
        try {
            if (decision === 'rejected') {
                const { error } = await supabase
                    .from('billing_returns')
                    .update({ status: 'rejected' })
                    .eq('id', novelty.id);
                if (error) throw error;
            } else {
                const { data: itemData, error: itemError } = await supabase
                    .from('order_items')
                    .select('unit_price, quantity')
                    .eq('order_id', novelty.order_id)
                    .eq('product_id', novelty.product_id)
                    .single();
                if (itemError) throw itemError;

                const newQty = Math.max(0, Number(itemData.quantity) - Number(novelty.quantity_returned));
                const priceCredit = Number(novelty.quantity_returned) * Number(itemData.unit_price);

                const { error: updateItemError } = await supabase
                    .from('order_items')
                    .update({ quantity: newQty })
                    .eq('order_id', novelty.order_id)
                    .eq('product_id', novelty.product_id);
                if (updateItemError) throw updateItemError;

                const { data: orderData } = await supabase.from('orders').select('total').eq('id', novelty.order_id).single();
                const newTotal = Math.max(0, (Number(orderData?.total) || 0) - priceCredit);
                const { error: updateOrderError } = await supabase
                    .from('orders')
                    .update({ total: newTotal })
                    .eq('id', novelty.order_id);
                if (updateOrderError) throw updateOrderError;

                const { data: invoiceData } = await supabase.from('billing_invoices').select('id, order_id').eq('order_id', novelty.order_id).single();
                if (invoiceData) {
                    const { data: orderProf } = await supabase
                        .from('orders')
                        .select('profiles(iva_responsible)')
                        .eq('id', novelty.order_id)
                        .single();
                    const isIva = (orderProf as any)?.profiles?.iva_responsible || false;
                    const totalBase = isIva ? newTotal / 1.19 : newTotal;
                    const totalTax = isIva ? newTotal - totalBase : 0;

                    await supabase
                        .from('billing_invoices')
                        .update({
                            total_base: totalBase,
                            total_tax: totalTax,
                            total_final: newTotal
                        })
                        .eq('id', invoiceData.id);
                }

                await supabase.from('billing_returns').update({ status: 'approved' }).eq('id', novelty.id);
            }
            showToast(`✅ Novedad ${decision === 'approved' ? 'Aprobada y descontada' : 'Rechazada'} correctamente.`, 'success');
            fetchData();
            setSelectedNovelty(null);
        } catch (err: any) {
            console.error('Error processing novelty:', err);
            showToast('Error al procesar la novedad: ' + err.message, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const selectedCategoryL1Obj = RCA_CATEGORIES_L1.find(c => c.code === rcaCategoryL1);
    const selectedResponsibleObj = RESPONSIBLE_PARTIES[rcaResponsible];

    const isCurrentSelectedPqrReplacement = selectedPqr ? (
        parseRcaFromRecord(selectedPqr).isReplacementRejection ||
        (selectedPqr.subject || '').includes('[ALERTA PING-PONG]') ||
        (selectedPqr.description || '').includes('ALERTA CORTE DE BUCLE') ||
        selectedPqr.orders?.origin_source === 'customer_service' ||
        (selectedPqr.orders?.admin_notes || '').includes('REPOSICIÓN')
    ) : false;

    // Operational pulse counters and quick actions
    const pendingPqrsCount = pqrs.filter(p => p.status === 'pending' || p.status === 'in_progress').length;
    const resolvedPqrsCount = pqrs.filter(p => p.status === 'resolved' || p.status === 'rejected').length;
    const pendingNoveltiesCount = novelties.filter(n => n.status === 'pending_review').length;
    const firstPendingPqr = pqrs.find(p => p.status === 'pending' || p.status === 'in_progress');

    const handleSelectFirstPending = () => {
        if (firstPendingPqr) {
            setActiveTab('pending');
            handlePqrSelect(firstPendingPqr);
        }
    };

    return (
        <main style={{ 
            minHeight: '100vh', 
            backgroundColor: '#F8FAFC', 
            color: THEME.colors.textMain, 
            boxSizing: 'border-box',
            position: 'relative'
        }}>
            {/* Custom Sleek Scrollbar Styles */}
            <style>{`
                .cs-custom-scroll::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }
                .cs-custom-scroll::-webkit-scrollbar-track {
                    background: transparent;
                }
                .cs-custom-scroll::-webkit-scrollbar-thumb {
                    background: #CBD5E1;
                    border-radius: 9999px;
                }
                .cs-custom-scroll::-webkit-scrollbar-thumb:hover {
                    background: #94A3B8;
                }
            `}</style>
            
            {/* Toast Banner */}
            {toastMessage && (
                <div style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    zIndex: 99999,
                    padding: '12px 18px',
                    borderRadius: '12px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    backgroundColor: toastMessage.type === 'success' ? '#064E3B' : toastMessage.type === 'error' ? '#881337' : '#78350F',
                    color: 'white',
                    border: `1px solid ${toastMessage.type === 'success' ? '#059669' : toastMessage.type === 'error' ? '#E11D48' : '#D97706'}`
                }}>
                    {toastMessage.type === 'success' && <CheckCircle2 size={18} color="#34D399" />}
                    {toastMessage.type === 'error' && <AlertTriangle size={18} color="#FDA4AF" />}
                    {toastMessage.type === 'warning' && <AlertCircle size={18} color="#FDE68A" />}
                    <span>{toastMessage.text}</span>
                </div>
            )}

            {/* 1. SECCIÓN SUPERIOR: ENCABEZADO Y PULSO OPERATIVO (SE OCULTA AL HACER SCROLL O AL COLAPSAR) */}
            <div 
                ref={kpiHeaderRef}
                style={{
                    backgroundColor: '#F8FAFC',
                    padding: '0.85rem 2rem 0.5rem 2rem',
                    display: showKpis ? 'flex' : 'none',
                    flexDirection: 'column',
                    gap: '0.65rem',
                    transition: 'all 0.25s ease-in-out'
                }}
            >
                {/* Row 1: Title, Subtitle & Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px', borderRadius: '10px', backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary, boxShadow: '0 2px 6px rgba(13,122,87,0.12)' }}>
                            <HeartHandshake size={20} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h1 style={{ fontSize: '1.35rem', fontWeight: '900', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.02em', lineHeight: '1.2' }}>
                                    Mesa de Experiencia & Atención al Cliente
                                </h1>
                                <span style={{ fontSize: '0.68rem', fontWeight: '800', padding: '1px 7px', borderRadius: '9999px', backgroundColor: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }}>
                                    Ecosistema FruFresco
                                </span>
                            </div>
                            <p style={{ color: THEME.colors.textSecondary, fontSize: '0.78rem', margin: '2px 0 0 0', fontWeight: '500' }}>
                                Cuidando la relación con cada restaurante y cliente institucional mediante soluciones justas y aprendizaje continuo de calidad.
                            </p>
                        </div>
                    </div>

                    {/* Quick Access to RCA Dashboard & SOP Guide */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Link 
                            href="/admin/customer-service/rca"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 14px',
                                borderRadius: '10px',
                                backgroundColor: '#1E293B',
                                color: 'white',
                                fontWeight: '800',
                                fontSize: '0.75rem',
                                textDecoration: 'none',
                                boxShadow: '0 2px 8px rgba(30, 41, 59, 0.15)'
                            }}
                        >
                            <BarChart2 size={14} color="#34D399" />
                            <span>Dashboard Causa Raíz (RCA)</span>
                        </Link>
                        <RoleProcessGuide role="customer_service_agent" compact sectionTitle="Protocolo Operativo" />
                    </div>
                </div>

                {/* Row 2: Operational Pulse 4 Micro-Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.65rem' }}>
                    {/* Card 1: Casos por Atender Hoy */}
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '10px',
                        padding: '8px 12px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                    }}>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            backgroundColor: pendingPqrsCount > 0 ? '#FEF3C7' : '#DCFCE7',
                            color: pendingPqrsCount > 0 ? '#B45309' : '#15803D',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}>
                            <Clock size={16} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.66rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                Casos por Atender Hoy
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '1px' }}>
                                <span style={{ fontSize: '1.05rem', fontWeight: '900', color: '#0F172A' }}>
                                    {pendingPqrsCount}
                                </span>
                                <span style={{
                                    fontSize: '0.62rem',
                                    fontWeight: '800',
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    backgroundColor: pendingPqrsCount > 0 ? '#FEF3C7' : '#DCFCE7',
                                    color: pendingPqrsCount > 0 ? '#B45309' : '#15803D'
                                }}>
                                    {pendingPqrsCount > 0 ? 'Atención requerida' : 'Al día'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Card 2: Tiempo Promedio de Respuesta */}
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '10px',
                        padding: '8px 12px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                    }}>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            backgroundColor: '#E0F2FE',
                            color: '#0284C7',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}>
                            <Zap size={16} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.66rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                Tiempo de Respuesta
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '1px' }}>
                                <span style={{ fontSize: '1.05rem', fontWeight: '900', color: '#0F172A' }}>
                                    &lt; 45 min
                                </span>
                                <span style={{ fontSize: '0.62rem', fontWeight: '700', color: '#0284C7' }}>
                                    Meta estándar B2B
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Card 3: Tasa de Entrega Conforme OTIF */}
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '10px',
                        padding: '8px 12px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                    }}>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            backgroundColor: '#EAEFEA',
                            color: '#0D7A57',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}>
                            <ShieldCheck size={16} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.66rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                Entrega Conforme OTIF
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '1px' }}>
                                <span style={{ fontSize: '1.05rem', fontWeight: '900', color: '#0F172A' }}>
                                    98.2%
                                </span>
                                <span style={{ fontSize: '0.62rem', fontWeight: '700', color: '#0D7A57' }}>
                                    Calidad en destino
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Card 4: Protección de Fletes */}
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '10px',
                        padding: '8px 12px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                    }}>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            backgroundColor: '#F3E8FF',
                            color: '#9333EA',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}>
                            <RotateCcw size={16} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.66rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                Protección de Fletes
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '1px' }}>
                                <span style={{ fontSize: '1.05rem', fontWeight: '900', color: '#0F172A' }}>
                                    Corte de Bucle
                                </span>
                                <span style={{ fontSize: '0.62rem', fontWeight: '700', color: '#9333EA' }}>
                                    Regla Activa
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. BARRA DE CONTROL STICKY (A PARTIR DE LA LÍNEA HACIA ABAJO: BUSCADOR PRIMERO Y PESTAÑAS) */}
            <div style={{
                position: 'sticky',
                top: '85px',
                zIndex: 45,
                backgroundColor: '#F8FAFC',
                borderBottom: '1px solid #E2E8F0',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
                padding: '0.55rem 2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                transition: 'all 0.2s ease'
            }}>
                {/* Search Input - First thing visible, wide & prominent */}
                <div style={{ position: 'relative', flex: 1, maxWidth: '520px', minWidth: '260px' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', display: 'flex' }}>
                        <Search size={15} />
                    </span>
                    <input 
                        type="text"
                        placeholder="Buscar por cliente, motivo, responsable o pedido..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        onFocus={() => {
                            if (typeof window !== 'undefined' && window.scrollY < 120 && showKpis) {
                                window.scrollTo({ top: 160, behavior: 'smooth' });
                            }
                        }}
                        style={{
                            width: '100%',
                            padding: '8px 32px 8px 34px',
                            borderRadius: '10px',
                            border: '1.5px solid #CBD5E1',
                            fontSize: '0.82rem',
                            outline: 'none',
                            backgroundColor: 'white',
                            boxSizing: 'border-box',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                            transition: 'all 0.15s ease'
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
                                border: 'none',
                                background: '#F1F5F9',
                                color: '#64748B',
                                borderRadius: '50%',
                                width: '18px',
                                height: '18px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <X size={11} strokeWidth={2.5} />
                        </button>
                    )}
                </div>

                {/* Right: Global View Tabs + KPI Toggle Button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Global View Tabs */}
                    <div style={{ display: 'flex', gap: '4px', backgroundColor: '#E2E8F0', padding: '3px', borderRadius: '10px' }}>
                        <button 
                            onClick={() => { setActiveTab('pending'); setStatusFilter('all'); setSelectedPqr(null); setSelectedNovelty(null); }}
                            style={{
                                padding: '6px 14px',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '0.78rem',
                                fontWeight: '800',
                                cursor: 'pointer',
                                backgroundColor: activeTab !== 'novelties' ? 'white' : 'transparent',
                                color: activeTab !== 'novelties' ? '#0D7A57' : '#64748B',
                                boxShadow: activeTab !== 'novelties' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.15s'
                            }}
                        >
                            <MessageSquare size={14} />
                            <span>PQRs Institucionales</span>
                            <span style={{
                                fontSize: '0.65rem',
                                padding: '1px 6px',
                                borderRadius: '9999px',
                                backgroundColor: activeTab !== 'novelties' ? '#EAEFEA' : '#CBD5E1',
                                color: activeTab !== 'novelties' ? '#0D7A57' : '#334155',
                                fontWeight: '900'
                            }}>
                                {pqrs.length}
                            </span>
                        </button>
                        <button 
                            onClick={() => { setActiveTab('novelties'); setSelectedPqr(null); setSelectedNovelty(null); }}
                            style={{
                                padding: '6px 14px',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '0.78rem',
                                fontWeight: '800',
                                cursor: 'pointer',
                                backgroundColor: activeTab === 'novelties' ? 'white' : 'transparent',
                                color: activeTab === 'novelties' ? '#0D7A57' : '#64748B',
                                boxShadow: activeTab === 'novelties' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.15s'
                            }}
                        >
                            <Truck size={14} />
                            <span>Novedades Conductor</span>
                            <span style={{
                                fontSize: '0.65rem',
                                padding: '1px 6px',
                                borderRadius: '9999px',
                                backgroundColor: activeTab === 'novelties' ? '#EAEFEA' : '#CBD5E1',
                                color: activeTab === 'novelties' ? '#0D7A57' : '#334155',
                                fontWeight: '900'
                            }}>
                                {novelties.length}
                            </span>
                        </button>
                    </div>

                    {/* Toggle button to show/hide top KPI cockpit */}
                    <button
                        type="button"
                        onClick={toggleShowKpis}
                        title={showKpis ? "Ocultar panel superior de indicadores" : "Mostrar panel superior de indicadores"}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '9px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: 'white',
                            color: '#475569',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            transition: 'all 0.15s'
                        }}
                    >
                        {showKpis ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        <span>{showKpis ? 'Ocultar KPIs' : 'Ver KPIs'}</span>
                    </button>
                </div>
            </div>

            {/* 3. DUAL INDEPENDENT SCROLLING GALLERIES (CON MÁXIMO PROTAGONISMO) */}
            <div style={{
                height: 'calc(100vh - 85px - 62px)',
                minHeight: '640px',
                display: 'grid',
                gridTemplateColumns: 'minmax(380px, 440px) 1fr',
                gap: '1.25rem',
                padding: '0.75rem 2rem 1rem 2rem',
                boxSizing: 'border-box'
            }}>
                {/* Left Column: Tickets List (Card Container) */}
                <div style={{
                    height: '100%',
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: 'white',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.02)',
                    overflow: 'hidden'
                }}>
                    {/* Encabezado y Filtro por Estado (Sticky header inside left column) */}
                    <div style={{
                        padding: '10px 14px',
                        borderBottom: '1px solid #F1F5F9',
                        backgroundColor: '#FFFFFF',
                        flexShrink: 0
                    }}>
                        {/* Header: Title & Total Badge & Refresh */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '8px',
                                    backgroundColor: '#EAEFEA',
                                    color: '#0D7A57',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <Inbox size={15} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '0.86rem', fontWeight: '900', color: '#1E293B', lineHeight: '1.2' }}>
                                        {activeTab === 'novelties' ? 'Novedades de Conductor' : 'Bandeja de Tickets'}
                                    </h3>
                                    <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: '600' }}>
                                        {activeTab === 'novelties' 
                                            ? `${filteredNovelties.length} de ${novelties.length} novedades` 
                                            : `${filteredPqrs.length} de ${pqrs.length} casos`}
                                    </span>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={fetchData}
                                title="Refrescar listado"
                                style={{
                                    background: '#F8FAFC',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    color: '#475569',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontSize: '0.68rem',
                                    fontWeight: '700'
                                }}
                            >
                                <RotateCcw size={11} className={loading ? 'animate-spin' : ''} />
                                <span>Refrescar</span>
                            </button>
                        </div>

                        {/* Filtro por Estado (Pills con Conteo) */}
                        {activeTab !== 'novelties' ? (
                            <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px', scrollbarWidth: 'none' }}>
                                {[
                                    { id: 'all', label: 'Todos', count: pqrCounts.all, color: '#475569', bg: '#F1F5F9' },
                                    { id: 'pending', label: 'Pendientes', count: pqrCounts.pending, color: '#B45309', bg: '#FEF3C7' },
                                    { id: 'in_progress', label: 'En Curso', count: pqrCounts.in_progress, color: '#0369A1', bg: '#E0F2FE' },
                                    { id: 'resolved', label: 'Resueltos', count: pqrCounts.resolved, color: '#15803D', bg: '#DCFCE7' },
                                    { id: 'rejected', label: 'Rechazados', count: pqrCounts.rejected, color: '#DC2626', bg: '#FEE2E2' }
                                ].map(st => {
                                    const isSel = statusFilter === st.id;
                                    return (
                                        <button
                                            key={st.id}
                                            type="button"
                                            onClick={() => setStatusFilter(st.id as any)}
                                            style={{
                                                padding: '3px 7px',
                                                borderRadius: '6px',
                                                border: `1.5px solid ${isSel ? '#0D7A57' : 'transparent'}`,
                                                backgroundColor: isSel ? '#EAEFEA' : '#F8FAFC',
                                                color: isSel ? '#0D7A57' : '#64748B',
                                                fontSize: '0.68rem',
                                                fontWeight: isSel ? '900' : '700',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                whiteSpace: 'nowrap',
                                                transition: 'all 0.12s ease'
                                            }}
                                        >
                                            <span>{st.label}</span>
                                            <span style={{
                                                fontSize: '0.62rem',
                                                padding: '1px 5px',
                                                borderRadius: '9999px',
                                                backgroundColor: isSel ? '#0D7A57' : st.bg,
                                                color: isSel ? 'white' : st.color,
                                                fontWeight: '900'
                                            }}>
                                                {st.count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px', scrollbarWidth: 'none' }}>
                                {[
                                    { id: 'all', label: 'Todas', count: noveltyCounts.all, color: '#475569', bg: '#F1F5F9' },
                                    { id: 'pending_review', label: 'Pendientes', count: noveltyCounts.pending_review, color: '#B45309', bg: '#FEF3C7' },
                                    { id: 'approved', label: 'Aprobadas', count: noveltyCounts.approved, color: '#15803D', bg: '#DCFCE7' },
                                    { id: 'rejected', label: 'Rechazadas', count: noveltyCounts.rejected, color: '#DC2626', bg: '#FEE2E2' }
                                ].map(st => {
                                    const isSel = noveltyStatusFilter === st.id;
                                    return (
                                        <button
                                            key={st.id}
                                            type="button"
                                            onClick={() => setNoveltyStatusFilter(st.id as any)}
                                            style={{
                                                padding: '3px 7px',
                                                borderRadius: '6px',
                                                border: `1.5px solid ${isSel ? '#0D7A57' : 'transparent'}`,
                                                backgroundColor: isSel ? '#EAEFEA' : '#F8FAFC',
                                                color: isSel ? '#0D7A57' : '#64748B',
                                                fontSize: '0.68rem',
                                                fontWeight: isSel ? '900' : '700',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                whiteSpace: 'nowrap',
                                                transition: 'all 0.12s ease'
                                            }}
                                        >
                                            <span>{st.label}</span>
                                            <span style={{
                                                fontSize: '0.62rem',
                                                padding: '1px 5px',
                                                borderRadius: '9999px',
                                                backgroundColor: isSel ? '#0D7A57' : st.bg,
                                                color: isSel ? 'white' : st.color,
                                                fontWeight: '900'
                                            }}>
                                                {st.count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Scrollable Tickets List (Independent Scroll) */}
                    <div 
                        className="cs-custom-scroll"
                        style={{
                            flex: 1,
                            minHeight: 0,
                            overflowY: 'auto',
                            overscrollBehavior: 'contain',
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            scrollbarWidth: 'thin',
                            scrollbarColor: '#CBD5E1 transparent'
                        }}
                    >
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', backgroundColor: 'white', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                                <Loader2 className="animate-spin" size={30} style={{ color: '#0D7A57', margin: '0 auto' }} />
                                <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '12px', fontWeight: '700' }}>Cargando casos y novedades...</p>
                            </div>
                        ) : activeTab === 'novelties' ? (
                            filteredNovelties.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '3rem 1.5rem', backgroundColor: 'white', borderRadius: '16px', border: '1px solid #E2E8F0', color: '#64748B' }}>
                                    <CheckCircle2 size={32} color="#10B981" style={{ margin: '0 auto 8px auto' }} />
                                    <h4 style={{ margin: 0, fontWeight: '800', color: '#1E293B', fontSize: '0.92rem' }}>Sin novedades pendientes</h4>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem' }}>No hay novedades de ruta pendientes de revisión contable.</p>
                                </div>
                            ) : (
                                filteredNovelties.map(n => {
                                    const isSelected = selectedNovelty?.id === n.id;
                                    const clientName = n.orders?.profiles?.company_name || n.orders?.profiles?.contact_name || 'Cliente Desconocido';
                                    const initials = getClientInitials(clientName);
                                    return (
                                        <div 
                                            key={n.id}
                                            onClick={() => { setSelectedPqr(null); setSelectedNovelty(n); }}
                                            style={{
                                                backgroundColor: isSelected ? '#F0FDF4' : 'white',
                                                padding: '1.15rem',
                                                borderRadius: '16px',
                                                border: `1px solid ${isSelected ? '#0D7A57' : '#E2E8F0'}`,
                                                borderLeft: isSelected ? '4px solid #0D7A57' : '4px solid transparent',
                                                cursor: 'pointer',
                                                transition: 'all 0.18s ease',
                                                boxShadow: isSelected ? '0 6px 16px rgba(13, 122, 87, 0.12)' : '0 1px 3px rgba(0,0,0,0.02)'
                                            }}
                                        >
                                            {/* Status & Date */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <span style={{ 
                                                    fontSize: '0.65rem', 
                                                    fontWeight: '800', 
                                                    padding: '2px 8px', 
                                                    borderRadius: '6px', 
                                                    textTransform: 'uppercase',
                                                    backgroundColor: n.status === 'approved' ? '#DCFCE7' : n.status === 'rejected' ? '#FEE2E2' : '#FEF3C7',
                                                    color: n.status === 'approved' ? '#15803D' : n.status === 'rejected' ? '#EF4444' : '#B45309',
                                                    border: `1px solid ${n.status === 'approved' ? '#BBF7D0' : n.status === 'rejected' ? '#FECACA' : '#FDE68A'}`
                                                }}>
                                                    {n.status === 'pending_review' ? 'Pendiente' : n.status === 'approved' ? 'Aprobada' : 'Rechazada'}
                                                </span>
                                                <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: '600' }}>
                                                    {formatDateFriendly(n.created_at)}
                                                </span>
                                            </div>

                                            {/* Product Title */}
                                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '800', color: '#1E293B', lineHeight: '1.3' }}>
                                                {n.products?.name}
                                            </h4>

                                            {/* Quantity & Order badge */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '0.68rem', fontWeight: '800', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#F1F5F9', color: '#475569' }}>
                                                    Cantidad: {n.quantity_returned} {n.products?.unit_of_measure}
                                                </span>
                                                {n.orders?.sequence_id && (
                                                    <span style={{ fontSize: '0.68rem', fontWeight: '800', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#E0F2FE', color: '#0369A1' }}>
                                                        Pedido #{n.orders.sequence_id}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Client Info & WhatsApp Quick Action */}
                                            {(() => {
                                                const rawNovPhone = n.orders?.profiles?.contact_phone || n.orders?.profiles?.phone;
                                                const novPhone = cleanColombianPhone(rawNovPhone);
                                                return (
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #F1F5F9' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                                            <div style={{ width: '24px', height: '24px', borderRadius: '6px', backgroundColor: '#EAEFEA', color: '#0D7A57', fontSize: '0.65rem', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                {initials}
                                                            </div>
                                                            <span style={{ fontSize: '0.76rem', color: '#334155', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {clientName}
                                                            </span>
                                                        </div>
                                                        {novPhone.isValid && (
                                                            <a
                                                                href={`https://wa.me/${novPhone.waNumber}?text=${encodeURIComponent(`Hola ${clientName}, te contactamos de FruFresco SAC respecto a la devolución en entrega de: ${n.products?.name}.`)}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '3px',
                                                                    padding: '2px 6px',
                                                                    borderRadius: '5px',
                                                                    backgroundColor: '#DCFCE7',
                                                                    color: '#15803D',
                                                                    border: '1px solid #BBF7D0',
                                                                    fontSize: '0.64rem',
                                                                    fontWeight: '800',
                                                                    textDecoration: 'none',
                                                                    flexShrink: 0
                                                                }}
                                                                title={`Escribir por WhatsApp a ${novPhone.display}`}
                                                            >
                                                                <MessageCircle size={10} /> WhatsApp
                                                            </a>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    );
                                })
                            )
                        ) : (
                            filteredPqrs.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '3rem 1.5rem', backgroundColor: 'white', borderRadius: '16px', border: '1px solid #E2E8F0', color: '#64748B' }}>
                                    <CheckCircle2 size={32} color="#10B981" style={{ margin: '0 auto 8px auto' }} />
                                    <h4 style={{ margin: 0, fontWeight: '800', color: '#1E293B', fontSize: '0.92rem' }}>
                                        {activeTab === 'pending' ? '¡Bandeja al día!' : 'Sin historial en esta vista'}
                                    </h4>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem' }}>
                                        {activeTab === 'pending' ? 'No hay casos pendientes por responder en este momento.' : 'No se encontraron PQRs archivadas con el filtro actual.'}
                                    </p>
                                </div>
                            ) : (
                                filteredPqrs.map(p => {
                                    const isSelected = selectedPqr?.id === p.id;
                                    const rcaParsed = parseRcaFromRecord(p);
                                    const isPingPong = rcaParsed.isReplacementRejection || (p.subject || '').includes('[ALERTA PING-PONG]');
                                    const badgeStyle = getTypeBadgeStyle(p.type);
                                    const clientName = p.profiles?.company_name || p.profiles?.contact_name || 'Cliente Institucional';
                                    const initials = getClientInitials(clientName);
                                    const isB2B = p.profiles?.role === 'b2b_client';
                                    const responsibleParty = rcaParsed.responsible !== 'no_definido' ? RESPONSIBLE_PARTIES[rcaParsed.responsible] : null;
                                    const authorInfo = getPqrAuthorInfo(p);
                                    const pqrPhotos = getPqrPhotos(p);

                                    return (
                                        <div 
                                            key={p.id}
                                            onClick={() => handlePqrSelect(p)}
                                            style={{
                                                backgroundColor: isSelected ? '#F0FDF4' : 'white',
                                                padding: '1.15rem',
                                                borderRadius: '16px',
                                                border: `1px solid ${isSelected ? '#0D7A57' : '#E2E8F0'}`,
                                                borderLeft: isSelected ? '4px solid #0D7A57' : '4px solid transparent',
                                                cursor: 'pointer',
                                                transition: 'all 0.18s ease',
                                                boxShadow: isSelected ? '0 6px 16px rgba(13, 122, 87, 0.12)' : '0 1px 3px rgba(0,0,0,0.02)'
                                            }}
                                        >
                                            {/* Header: Type, PingPong & Photos + Date */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                                    <span style={{ 
                                                        fontSize: '0.64rem', 
                                                        fontWeight: '800', 
                                                        padding: '2px 7px', 
                                                        borderRadius: '5px', 
                                                        textTransform: 'uppercase',
                                                        backgroundColor: badgeStyle.bg,
                                                        color: badgeStyle.text,
                                                        border: `1px solid ${badgeStyle.border}`
                                                    }}>
                                                        {badgeStyle.label}
                                                    </span>

                                                    {isPingPong && (
                                                        <span style={{ fontSize: '0.62rem', fontWeight: '900', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                            <ShieldAlert size={10} /> Ping-Pong
                                                        </span>
                                                    )}

                                                    {/* Canal Badge */}
                                                    <span style={{ 
                                                        fontSize: '0.62rem', 
                                                        fontWeight: '800', 
                                                        padding: '2px 6px', 
                                                        borderRadius: '4px', 
                                                        backgroundColor: authorInfo.channelBadgeBg, 
                                                        color: authorInfo.channelBadgeColor, 
                                                        border: `1px solid ${authorInfo.channelBadgeBorder}`,
                                                        display: 'inline-flex', 
                                                        alignItems: 'center', 
                                                        gap: '3px' 
                                                    }}>
                                                        {authorInfo.channel === 'conductor' ? <Truck size={10} /> : authorInfo.channel === 'portal_b2b' ? <Building2 size={10} /> : authorInfo.channel === 'portal_b2c' ? <User size={10} /> : <UserCheck size={10} />}
                                                        {authorInfo.channelLabel}
                                                    </span>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    {/* Photo Indicator Badge */}
                                                    {pqrPhotos.length > 0 ? (
                                                        <span style={{ 
                                                            fontSize: '0.62rem', 
                                                            fontWeight: '800', 
                                                            padding: '2px 6px', 
                                                            borderRadius: '4px', 
                                                            backgroundColor: '#DCFCE7', 
                                                            color: '#15803D', 
                                                            border: '1px solid #BBF7D0', 
                                                            display: 'inline-flex', 
                                                            alignItems: 'center', 
                                                            gap: '3px' 
                                                        }} title={`${pqrPhotos.length} fotos adjuntas`}>
                                                            <Camera size={10} /> {pqrPhotos.length}
                                                        </span>
                                                    ) : (
                                                        <span style={{ 
                                                            fontSize: '0.6rem', 
                                                            fontWeight: '600', 
                                                            padding: '2px 5px', 
                                                            borderRadius: '4px', 
                                                            backgroundColor: '#F8FAFC', 
                                                            color: '#94A3B8', 
                                                            border: '1px solid #E2E8F0', 
                                                            display: 'inline-flex', 
                                                            alignItems: 'center', 
                                                            gap: '3px' 
                                                        }} title="Sin fotos adjuntas">
                                                            <CameraOff size={9} /> 0
                                                        </span>
                                                    )}

                                                    <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: '600' }}>
                                                        {formatDateFriendly(p.created_at)}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Subject */}
                                            <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: '800', color: '#1E293B', lineHeight: '1.3' }}>
                                                {p.subject}
                                            </h4>

                                            {/* Client Info Row */}
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                                                    <div style={{
                                                        width: '26px',
                                                        height: '26px',
                                                        borderRadius: '8px',
                                                        backgroundColor: isB2B ? '#EAEFEA' : '#F1F5F9',
                                                        color: isB2B ? '#0D7A57' : '#475569',
                                                        fontSize: '0.65rem',
                                                        fontWeight: '800',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        flexShrink: 0
                                                    }}>
                                                        {initials}
                                                    </div>
                                                    <span style={{ fontSize: '0.78rem', color: '#334155', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {clientName}
                                                    </span>
                                                </div>

                                                {p.orders?.sequence_id && (
                                                    <span style={{ fontSize: '0.68rem', fontWeight: '800', padding: '2px 7px', borderRadius: '5px', backgroundColor: '#E0F2FE', color: '#0369A1', flexShrink: 0 }}>
                                                        #{p.orders.sequence_id}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Who created / mounted it & WhatsApp Quick Action */}
                                            <div style={{
                                                marginTop: '6px',
                                                padding: '4px 8px',
                                                backgroundColor: '#F8FAFC',
                                                borderRadius: '6px',
                                                border: '1px solid #F1F5F9',
                                                fontSize: '0.68rem',
                                                color: '#64748B',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '6px'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                                                    <UserCheck size={12} color="#0D7A57" style={{ flexShrink: 0 }} />
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        Radicó: <strong style={{ color: '#1E293B' }}>{authorInfo.authorName}</strong>
                                                    </span>
                                                </div>

                                                {authorInfo.isPhoneValid && (
                                                    <a
                                                        href={`https://wa.me/${authorInfo.cleanPhone}?text=${encodeURIComponent(`Hola ${authorInfo.clientContact || authorInfo.companyName}, te saludamos de FruFresco respecto a tu solicitud: "${p.subject}".`)}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '3px',
                                                            padding: '2px 7px',
                                                            borderRadius: '5px',
                                                            backgroundColor: '#DCFCE7',
                                                            color: '#15803D',
                                                            border: '1px solid #BBF7D0',
                                                            fontSize: '0.64rem',
                                                            fontWeight: '800',
                                                            textDecoration: 'none',
                                                            flexShrink: 0,
                                                            transition: 'all 0.12s ease'
                                                        }}
                                                        title={`Escribir por WhatsApp a ${authorInfo.phone}`}
                                                    >
                                                        <MessageCircle size={10} /> WhatsApp
                                                    </a>
                                                )}
                                            </div>

                                            {/* Responsible attribution chip if assigned */}
                                            {responsibleParty && (
                                                <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <div style={{
                                                        fontSize: '0.65rem',
                                                        fontWeight: '700',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '5px',
                                                        padding: '2px 8px',
                                                        borderRadius: '6px',
                                                        backgroundColor: responsibleParty.bgLight,
                                                        color: responsibleParty.color,
                                                        border: `1px solid ${responsibleParty.border}`
                                                    }}>
                                                        {getResponsibleIcon(rcaParsed.responsible)}
                                                        <span>{responsibleParty.label}</span>
                                                    </div>
                                                    <span style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: '600' }}>
                                                        RCA Asignada
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )
                        )}
                        </div>
                    </div>

                    {/* Right Column: Case Detail & Resolution Cockpit (Independent Scroll) */}
                    <div 
                        ref={rightPanelRef}
                        className="cs-custom-scroll"
                        style={{ 
                            height: '100%', 
                            minHeight: 0, 
                            overflowY: 'auto', 
                            overscrollBehavior: 'contain',
                            backgroundColor: 'white', 
                            borderRadius: '16px', 
                            border: '1px solid #E2E8F0', 
                            padding: '1.5rem 1.75rem', 
                            boxShadow: '0 4px 16px rgba(0,0,0,0.02)', 
                            scrollbarWidth: 'thin', 
                            scrollbarColor: '#CBD5E1 transparent' 
                        }}
                    >
                        {activeTab === 'novelties' ? (
                            selectedNovelty ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    {/* Novelty Header */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #F1F5F9', paddingBottom: '1rem', gap: '1rem' }}>
                                        <div>
                                            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: '900', color: '#1E293B' }}>
                                                Novedad: {selectedNovelty.products?.name}
                                            </h2>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '0.68rem', fontWeight: '800', padding: '3px 8px', borderRadius: '6px', backgroundColor: '#EAEFEA', color: '#0D7A57', textTransform: 'uppercase' }}>
                                                    Cantidad: {selectedNovelty.quantity_returned} {selectedNovelty.products?.unit_of_measure}
                                                </span>
                                                {selectedNovelty.orders && (
                                                    <span style={{ fontSize: '0.68rem', fontWeight: '800', padding: '3px 8px', borderRadius: '6px', backgroundColor: '#E0F2FE', color: '#0369A1' }}>
                                                        PEDIDO #{selectedNovelty.orders.sequence_id}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            <span style={{
                                                fontSize: '0.72rem',
                                                fontWeight: '800',
                                                padding: '4px 12px',
                                                borderRadius: '9999px',
                                                backgroundColor: selectedNovelty.status === 'approved' ? '#DCFCE7' : selectedNovelty.status === 'rejected' ? '#FEE2E2' : '#FEF3C7',
                                                color: selectedNovelty.status === 'approved' ? '#15803D' : selectedNovelty.status === 'rejected' ? '#EF4444' : '#B45309',
                                                textTransform: 'uppercase',
                                                border: '1px solid currentColor'
                                            }}>
                                                {selectedNovelty.status === 'pending_review' ? 'Pendiente' : selectedNovelty.status === 'approved' ? 'Aprobada' : 'Rechazada'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Motivo y Cliente */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.5rem' }}>
                                        <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '1rem' }}>
                                            <h4 style={{ margin: '0 0 6px 0', fontSize: '0.75rem', fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase' }}>
                                                Motivo del Conductor / Despacho
                                            </h4>
                                            <p style={{ margin: 0, fontSize: '0.82rem', color: '#334155', lineHeight: '1.5', whiteSpace: 'pre-wrap', fontWeight: '500' }}>
                                                {selectedNovelty.reason || 'Sin motivo detallado'}
                                            </p>
                                        </div>
                                        <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '1rem' }}>
                                            <h4 style={{ margin: '0 0 6px 0', fontSize: '0.75rem', fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase' }}>
                                                Datos del Cliente
                                            </h4>
                                            <div style={{ fontSize: '0.88rem', fontWeight: '900', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Building2 size={14} color="#64748B" />
                                                {selectedNovelty.orders?.profiles?.company_name || selectedNovelty.orders?.profiles?.contact_name || 'Desconocido'}
                                            </div>
                                            {selectedNovelty.orders?.profiles?.nit && (
                                                <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '3px' }}>
                                                    NIT: {selectedNovelty.orders.profiles.nit}
                                                </div>
                                            )}
                                            {selectedNovelty.orders && (
                                                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #E2E8F0', fontSize: '0.75rem', color: '#64748B' }}>
                                                    <strong>Venta original:</strong> {formatMoney(selectedNovelty.orders.total)}
                                                </div>
                                            )}

                                            {/* WhatsApp Quick Action in Novelty */}
                                            {(() => {
                                                const rawNovPhone = selectedNovelty.orders?.profiles?.contact_phone || selectedNovelty.orders?.profiles?.phone;
                                                const novPhone = cleanColombianPhone(rawNovPhone);
                                                const clientName = selectedNovelty.orders?.profiles?.company_name || selectedNovelty.orders?.profiles?.contact_name || 'Cliente';
                                                const profileId = (selectedNovelty.orders?.profiles as any)?.id;

                                                return (
                                                    <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #E2E8F0' }}>
                                                        {novPhone.isValid ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                                                <a
                                                                    href={`https://wa.me/${novPhone.waNumber}?text=${encodeURIComponent(`Hola ${clientName}, te contactamos de FruFresco SAC respecto a la novedad de entrega en el pedido #${selectedNovelty.orders?.sequence_id}: "${selectedNovelty.products?.name}".`)}`}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    style={{
                                                                        padding: '4px 10px',
                                                                        borderRadius: '6px',
                                                                        backgroundColor: '#DCFCE7',
                                                                        color: '#15803D',
                                                                        border: '1px solid #BBF7D0',
                                                                        fontSize: '0.72rem',
                                                                        fontWeight: '800',
                                                                        textDecoration: 'none',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '5px'
                                                                    }}
                                                                >
                                                                    <MessageCircle size={13} /> WhatsApp: {novPhone.display} <ExternalLink size={10} />
                                                                </a>
                                                            </div>
                                                        ) : (
                                                            <div>
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                                                                    <span style={{ fontSize: '0.68rem', color: '#DC2626', fontWeight: '700' }}>Sin celular WhatsApp</span>
                                                                    {profileId && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setEditingPhoneProfileId(profileId);
                                                                                setNewPhoneInput('');
                                                                            }}
                                                                            style={{ backgroundColor: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', padding: '3px 8px', borderRadius: '5px', fontSize: '0.68rem', fontWeight: '800', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                                                        >
                                                                            <Plus size={10} /> Registrar
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                {editingPhoneProfileId === profileId && (
                                                                    <div style={{ marginTop: '6px', display: 'flex', gap: '4px' }}>
                                                                        <input
                                                                            type="text"
                                                                            value={newPhoneInput}
                                                                            onChange={e => setNewPhoneInput(e.target.value)}
                                                                            placeholder="Ej: 3154456827"
                                                                            maxLength={12}
                                                                            style={{ flex: 1, padding: '3px 6px', fontSize: '0.72rem', borderRadius: '4px', border: '1px solid #CBD5E1' }}
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            disabled={savingPhone}
                                                                            onClick={() => handleSavePhone(profileId)}
                                                                            style={{ backgroundColor: '#0D7A57', color: 'white', border: 'none', padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '800', cursor: 'pointer' }}
                                                                        >
                                                                            {savingPhone ? '...' : 'OK'}
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setEditingPhoneProfileId(null)}
                                                                            style={{ backgroundColor: '#F1F5F9', border: '1px solid #E2E8F0', padding: '3px 6px', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer' }}
                                                                        >
                                                                            X
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>

                                    {/* Evidencia Fotográfica */}
                                    {selectedNovelty.photo_url && (
                                        <div style={{ backgroundColor: '#F8FAFC', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '1.15rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                                <h4 style={{ margin: 0, fontSize: '0.76rem', fontWeight: '900', color: '#1E293B', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Camera size={15} color="#0D7A57" /> Evidencia Fotográfica en Sitio (Conductor)
                                                </h4>
                                                <button
                                                    type="button"
                                                    onClick={() => setZoomPhotoUrl(selectedNovelty.photo_url)}
                                                    style={{
                                                        backgroundColor: '#0D7A57',
                                                        color: 'white',
                                                        border: 'none',
                                                        padding: '4px 10px',
                                                        borderRadius: '6px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: '800',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '5px'
                                                    }}
                                                >
                                                    <Maximize2 size={12} /> Ampliar / Zoom
                                                </button>
                                            </div>
                                            <div 
                                                onClick={() => setZoomPhotoUrl(selectedNovelty.photo_url)}
                                                style={{ 
                                                    width: '100%', 
                                                    maxWidth: '560px', 
                                                    height: '320px', 
                                                    borderRadius: '12px', 
                                                    overflow: 'hidden', 
                                                    border: '1px solid #CBD5E1', 
                                                    backgroundColor: '#0F172A',
                                                    cursor: 'zoom-in',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                            >
                                                <img 
                                                    src={selectedNovelty.photo_url} 
                                                    alt="Evidencia novedad" 
                                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Action buttons if Pending */}
                                    {selectedNovelty.status === 'pending_review' && (
                                        <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '1.25rem', display: 'flex', gap: '1rem', maxWidth: '420px' }}>
                                            <button 
                                                disabled={actionLoading}
                                                onClick={() => handleProcessNovelty(selectedNovelty, 'approved')}
                                                style={{ flex: 1, backgroundColor: '#0D7A57', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '10px', fontWeight: '800', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                            >
                                                <CheckCircle2 size={16} /> Aprobar y Descontar
                                            </button>
                                            <button 
                                                disabled={actionLoading}
                                                onClick={() => handleProcessNovelty(selectedNovelty, 'rejected')}
                                                style={{ flex: 1, backgroundColor: '#FEE2E2', color: '#EF4444', border: '1px solid #FECACA', padding: '10px 16px', borderRadius: '10px', fontWeight: '800', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                            >
                                                <AlertTriangle size={16} /> Rechazar Novedad
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '4rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                    <div style={{ width: '64px', height: '64px', borderRadius: '18px', backgroundColor: '#EFF6FF', color: '#1D4ED8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem' }}>
                                        <Truck size={30} />
                                    </div>
                                    <h3 style={{ margin: 0, fontWeight: '900', fontSize: '1.2rem', color: '#1E293B' }}>
                                        Novedades de Ruta Registradas por Conductor
                                    </h3>
                                    <p style={{ margin: '8px 0 1.5rem 0', fontSize: '0.84rem', color: '#64748B', maxWidth: '480px', lineHeight: '1.5' }}>
                                        Selecciona una devolución física de la lista izquierda para validar los motivos de rechazo, inspeccionar la evidencia y aprobar el descuento en facturación.
                                    </p>
                                    {novelties.find(n => n.status === 'pending_review') && (
                                        <button
                                            onClick={() => setSelectedNovelty(novelties.find(n => n.status === 'pending_review'))}
                                            style={{
                                                backgroundColor: '#0D7A57',
                                                color: 'white',
                                                border: 'none',
                                                padding: '10px 20px',
                                                borderRadius: '12px',
                                                fontWeight: '800',
                                                fontSize: '0.82rem',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                boxShadow: '0 4px 12px rgba(13, 122, 87, 0.2)'
                                            }}
                                        >
                                            <Play size={15} /> Atender Primera Novedad Pendiente
                                        </button>
                                    )}
                                </div>
                            )
                        ) : selectedPqr ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                
                                {/* Detail Header with Avatar and Badges */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #F1F5F9', paddingBottom: '1.15rem', gap: '1rem', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1, minWidth: '280px' }}>
                                        <div style={{
                                            width: '42px',
                                            height: '42px',
                                            borderRadius: '12px',
                                            backgroundColor: selectedPqr.profiles?.role === 'b2b_client' ? '#EAEFEA' : '#EFF6FF',
                                            color: selectedPqr.profiles?.role === 'b2b_client' ? '#0D7A57' : '#1D4ED8',
                                            fontSize: '0.82rem',
                                            fontWeight: '900',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                            boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
                                        }}>
                                            {getClientInitials(selectedPqr.profiles?.company_name || selectedPqr.profiles?.contact_name)}
                                        </div>
                                        <div>
                                            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: '900', color: '#1E293B', lineHeight: '1.25' }}>
                                                {selectedPqr.subject}
                                            </h2>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '0.68rem', fontWeight: '800', padding: '3px 8px', borderRadius: '6px', backgroundColor: '#EAEFEA', color: '#0D7A57', textTransform: 'uppercase' }}>
                                                    {selectedPqr.category}
                                                </span>
                                                <span style={{
                                                    fontSize: '0.68rem',
                                                    fontWeight: '800',
                                                    padding: '3px 8px',
                                                    borderRadius: '6px',
                                                    backgroundColor: selectedPqr.priority === 'urgent' || selectedPqr.priority === 'high' ? '#FEE2E2' : '#F1F5F9',
                                                    color: selectedPqr.priority === 'urgent' || selectedPqr.priority === 'high' ? '#EF4444' : '#64748B',
                                                    textTransform: 'uppercase'
                                                }}>
                                                    Prioridad: {selectedPqr.priority}
                                                </span>
                                                {selectedPqr.orders && (
                                                    <Link 
                                                        href={`/admin/orders/${selectedPqr.order_id}`}
                                                        style={{
                                                            fontSize: '0.68rem',
                                                            fontWeight: '800',
                                                            padding: '3px 8px',
                                                            borderRadius: '6px',
                                                            backgroundColor: '#E0F2FE',
                                                            color: '#0369A1',
                                                            textDecoration: 'none',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        PEDIDO #{selectedPqr.orders.sequence_id} <ExternalLink size={10} />
                                                    </Link>
                                                )}
                                                <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: '600' }}>
                                                    Radicado el {new Date(selectedPqr.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <span style={{
                                            fontSize: '0.74rem',
                                            fontWeight: '800',
                                            padding: '5px 14px',
                                            borderRadius: '9999px',
                                            backgroundColor: selectedPqr.status === 'resolved' ? '#DCFCE7' : selectedPqr.status === 'rejected' ? '#FEE2E2' : '#FEF3C7',
                                            color: selectedPqr.status === 'resolved' ? '#15803D' : selectedPqr.status === 'rejected' ? '#EF4444' : '#B45309',
                                            textTransform: 'uppercase',
                                            border: `1px solid ${selectedPqr.status === 'resolved' ? '#BBF7D0' : selectedPqr.status === 'rejected' ? '#FECACA' : '#FDE68A'}`,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px'
                                        }}>
                                            {selectedPqr.status === 'resolved' && <CheckCircle2 size={13} />}
                                            {selectedPqr.status === 'pending' ? 'Pendiente' : selectedPqr.status === 'in_progress' ? 'En Curso' : selectedPqr.status === 'resolved' ? 'Resuelto' : 'Rechazado'}
                                        </span>
                                    </div>
                                </div>

                                {/* Anti-Ping-Pong Alert Banner */}
                                {isCurrentSelectedPqrReplacement && (
                                    <div style={{
                                        backgroundColor: '#FEF2F2',
                                        border: '1px solid #FECACA',
                                        borderRadius: '14px',
                                        padding: '1.1rem',
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '12px'
                                    }}>
                                        <ShieldAlert size={24} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                                        <div>
                                            <div style={{ fontWeight: '900', fontSize: '0.88rem', color: '#991B1B' }}>
                                                ALERTA POKA-YOKE: RE-RECHAZO EN REPOSICIÓN (CORTE DE BUCLE LOGÍSTICO)
                                            </div>
                                            <p style={{ fontSize: '0.78rem', color: '#7F1D1D', margin: '4px 0 0 0', lineHeight: '1.45' }}>
                                                Este caso proviene de una reposición que fue rechazada por segunda vez en destino. 
                                                <strong> Para cortar el ciclo de fletes inútiles, la Opción 2 (Reprogramar) está bloqueada.</strong> Aplica Nota Crédito (Opción 3) o ajusta la factura a la cantidad real recibida (Opción 4).
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Main Description & Author/Client Info */}
                                {(() => {
                                    const selectedAuthorInfo = getPqrAuthorInfo(selectedPqr);
                                    const selectedPhotos = getPqrPhotos(selectedPqr);

                                    return (
                                        <>
                                            {/* Dossier del Caso: Contexto Técnico y Trazabilidad Dual */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.25rem' }}>
                                                {/* Left Column: Description & Delivery Details */}
                                                <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '1.15rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                            <h4 style={{ margin: 0, fontSize: '0.74rem', fontWeight: '900', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                                Descripción del Hecho Técnico
                                                            </h4>
                                                            <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#0D7A57', backgroundColor: '#EAEFEA', padding: '2px 7px', borderRadius: '4px' }}>
                                                                PQR #{selectedPqr.id.substring(0, 8)}
                                                            </span>
                                                        </div>
                                                        <p style={{ margin: 0, fontSize: '0.86rem', color: '#1E293B', lineHeight: '1.55', whiteSpace: 'pre-wrap', fontWeight: '500' }}>
                                                            {selectedPqr.description}
                                                        </p>
                                                    </div>
                                                    
                                                    {selectedPqr.orders && (
                                                        <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '0.74rem', color: '#64748B' }}>
                                                            <span><strong>Pedido:</strong> #{selectedPqr.orders.sequence_id} ({formatMoney(selectedPqr.orders.total)})</span>
                                                            {selectedPqr.orders.shipping_address && (
                                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                                                                    <strong>Dirección:</strong> {selectedPqr.orders.shipping_address}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Right Column: Trazabilidad Dual (FruFresco + Cliente) */}
                                                <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '1.15rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                    
                                                    {/* Bloque 1: Origen de Radicación (Canal y Autor Real) */}
                                                    <div style={{ backgroundColor: 'white', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '10px 12px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                            <div style={{ fontSize: '0.68rem', fontWeight: '800', color: selectedAuthorInfo.channelBadgeColor, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                {selectedAuthorInfo.channel === 'conductor' ? <Truck size={13} /> : selectedAuthorInfo.channel === 'portal_b2b' ? <Building2 size={13} /> : selectedAuthorInfo.channel === 'portal_b2c' ? <User size={13} /> : <UserCheck size={13} />}
                                                                <span>{selectedAuthorInfo.authorTitle}</span>
                                                            </div>
                                                            <span style={{ 
                                                                fontSize: '0.62rem', 
                                                                fontWeight: '800', 
                                                                padding: '1px 6px', 
                                                                borderRadius: '4px', 
                                                                backgroundColor: selectedAuthorInfo.channelBadgeBg, 
                                                                color: selectedAuthorInfo.channelBadgeColor, 
                                                                border: `1px solid ${selectedAuthorInfo.channelBadgeBorder}` 
                                                            }}>
                                                                {selectedAuthorInfo.channelLabel}
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '0.92rem', fontWeight: '900', color: '#0F172A' }}>
                                                            {selectedAuthorInfo.authorName}
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', color: selectedAuthorInfo.channelBadgeColor, fontWeight: '700', marginTop: '1px' }}>
                                                            {selectedAuthorInfo.authorRole}
                                                        </div>
                                                        <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <Clock size={11} />
                                                            <span>{selectedAuthorInfo.receptionChannel} • {new Date(selectedPqr.created_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                                        </div>
                                                    </div>

                                                    {/* Bloque 2: Cuenta Cliente Institucional & Contacto Directo */}
                                                    <div style={{ backgroundColor: 'white', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '10px 12px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                            <div style={{ fontSize: '0.68rem', fontWeight: '800', color: '#0284C7', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                <Building2 size={13} color="#0284C7" />
                                                                <span>Cuenta Cliente {selectedPqr.profiles?.role === 'b2c_client' ? 'B2C' : 'B2B'}</span>
                                                            </div>
                                                            {selectedAuthorInfo.nit && (
                                                                <span style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: '600' }}>
                                                                    NIT: {selectedAuthorInfo.nit}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.84rem', fontWeight: '800', color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {selectedAuthorInfo.companyName}
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '1px' }}>
                                                            Contacto en sitio: <strong>{selectedAuthorInfo.clientContact}</strong>
                                                        </div>

                                                        {/* Canales de Contacto: WhatsApp Prominente y Correo */}
                                                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #F1F5F9' }}>
                                                            {selectedAuthorInfo.isPhoneValid ? (
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', flexWrap: 'wrap' }}>
                                                                    <a 
                                                                        href={`https://wa.me/${selectedAuthorInfo.cleanPhone}?text=${encodeURIComponent(`Hola ${selectedAuthorInfo.clientContact || selectedAuthorInfo.companyName}, te contactamos de FruFresco SAC respecto a tu reporte PQR #${selectedPqr.id.substring(0, 8)} ("${selectedPqr.subject}"). Estamos gestionando tu solución.`)}`}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        style={{
                                                                            padding: '4px 10px',
                                                                            borderRadius: '6px',
                                                                            backgroundColor: '#DCFCE7',
                                                                            color: '#15803D',
                                                                            border: '1.5px solid #86EFAC',
                                                                            fontSize: '0.72rem',
                                                                            fontWeight: '800',
                                                                            textDecoration: 'none',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '5px',
                                                                            boxShadow: '0 1px 2px rgba(16, 185, 129, 0.12)'
                                                                        }}
                                                                    >
                                                                        <MessageCircle size={13} /> Escribir por WhatsApp ({selectedAuthorInfo.phone}) <ExternalLink size={10} />
                                                                    </a>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setEditingPhoneProfileId(selectedPqr.client_id);
                                                                                setNewPhoneInput(selectedAuthorInfo.phone);
                                                                            }}
                                                                            style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', padding: '3px 6px', borderRadius: '5px', fontSize: '0.66rem', color: '#64748B', cursor: 'pointer', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                                                                            title="Editar número celular"
                                                                        >
                                                                            <Edit2 size={9} /> Editar
                                                                        </button>
                                                                        {selectedAuthorInfo.email && (
                                                                            <a href={`mailto:${selectedAuthorInfo.email}?subject=${encodeURIComponent(`Seguimiento PQR FruFresco: ${selectedPqr.subject}`)}`} style={{ color: '#0369A1', textDecoration: 'none', fontSize: '0.68rem', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '3px', marginLeft: '4px' }}>
                                                                                <Mail size={11} /> Correo
                                                                            </a>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#DC2626', fontWeight: '700' }}>
                                                                            <AlertTriangle size={12} color="#DC2626" />
                                                                            <span>{selectedAuthorInfo.phone && selectedAuthorInfo.phone !== '.' ? `Teléfono no celular (${selectedAuthorInfo.phone})` : 'Sin celular para WhatsApp'}</span>
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setEditingPhoneProfileId(selectedPqr.client_id);
                                                                                setNewPhoneInput('');
                                                                            }}
                                                                            style={{ backgroundColor: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', padding: '3px 8px', borderRadius: '5px', fontSize: '0.68rem', fontWeight: '800', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                                                        >
                                                                            <Plus size={10} /> Registrar WhatsApp
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Formulario Inline para Registrar/Editar Celular */}
                                                            {editingPhoneProfileId === selectedPqr.client_id && (
                                                                <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                                    <label style={{ fontSize: '0.68rem', fontWeight: '800', color: '#475569', display: 'block', marginBottom: '4px' }}>
                                                                        Número de Celular para WhatsApp (10 dígitos):
                                                                    </label>
                                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                                        <input 
                                                                            type="text"
                                                                            value={newPhoneInput}
                                                                            onChange={e => setNewPhoneInput(e.target.value)}
                                                                            placeholder="Ej: 3154456827"
                                                                            maxLength={12}
                                                                            style={{ flex: 1, padding: '4px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.75rem', fontWeight: '700' }}
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            disabled={savingPhone}
                                                                            onClick={() => handleSavePhone(selectedPqr.client_id)}
                                                                            style={{ backgroundColor: '#0D7A57', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '800', cursor: 'pointer' }}
                                                                        >
                                                                            {savingPhone ? <Loader2 size={12} className="animate-spin" /> : 'Guardar'}
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setEditingPhoneProfileId(null)}
                                                                            style={{ backgroundColor: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0', padding: '4px 8px', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer' }}
                                                                        >
                                                                            Cancelar
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Photo Evidence Section (Compact & Zero Wasted Space) */}
                                            <div style={{ backgroundColor: '#F8FAFC', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '1rem' }}>
                                                {selectedPhotos.length > 0 ? (
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <Camera size={16} color="#0D7A57" />
                                                                <h4 style={{ margin: 0, fontSize: '0.78rem', fontWeight: '900', color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                                    Evidencia Fotográfica de Calidad ({selectedPhotos.length} {selectedPhotos.length === 1 ? 'Foto' : 'Fotos'})
                                                                </h4>
                                                            </div>
                                                            <div>
                                                                <input type="file" ref={fileInputRef} onChange={handleUploadEvidence} accept="image/*" style={{ display: 'none' }} />
                                                                <button
                                                                    type="button"
                                                                    disabled={uploadingPhoto}
                                                                    onClick={() => fileInputRef.current?.click()}
                                                                    style={{ backgroundColor: 'white', border: '1px solid #CBD5E1', padding: '5px 12px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '800', color: '#0D7A57', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                                                >
                                                                    {uploadingPhoto ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                                                                    <span>Adjuntar Otra Foto</span>
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Tight Photo Stage with Thumbnails */}
                                                        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                            {/* Active Photo Container */}
                                                            <div 
                                                                onClick={() => setZoomPhotoUrl(selectedPhotos[activePhotoIdx])}
                                                                style={{
                                                                    position: 'relative',
                                                                    width: '320px',
                                                                    height: '220px',
                                                                    borderRadius: '12px',
                                                                    overflow: 'hidden',
                                                                    border: '1px solid #CBD5E1',
                                                                    backgroundColor: '#0F172A',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    cursor: 'zoom-in',
                                                                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
                                                                }}
                                                            >
                                                                <img 
                                                                    src={selectedPhotos[activePhotoIdx]} 
                                                                    alt={`Evidencia ${activePhotoIdx + 1}`} 
                                                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                                                />
                                                                <div style={{ position: 'absolute', bottom: '8px', right: '8px', display: 'flex', gap: '6px' }}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => { e.stopPropagation(); setZoomPhotoUrl(selectedPhotos[activePhotoIdx]); }}
                                                                        style={{ backgroundColor: 'rgba(15, 23, 42, 0.85)', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '6px', fontSize: '0.66rem', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                    >
                                                                        <Maximize2 size={11} /> Ampliar
                                                                    </button>
                                                                    <a
                                                                        href={selectedPhotos[activePhotoIdx]}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        onClick={e => e.stopPropagation()}
                                                                        style={{ backgroundColor: 'rgba(255, 255, 255, 0.2)', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '6px', fontSize: '0.66rem', fontWeight: '700', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                    >
                                                                        <ExternalLink size={11} /> Original
                                                                    </a>
                                                                </div>
                                                                <div style={{ position: 'absolute', top: '8px', left: '8px', backgroundColor: 'rgba(15, 23, 42, 0.8)', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: '800' }}>
                                                                    Foto {activePhotoIdx + 1} de {selectedPhotos.length}
                                                                </div>
                                                            </div>

                                                            {/* Thumbnails list */}
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>
                                                                    Miniaturas de Cotejo:
                                                                </span>
                                                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                                    {selectedPhotos.map((url, idx) => {
                                                                        const isActive = idx === activePhotoIdx;
                                                                        return (
                                                                            <div 
                                                                                key={idx}
                                                                                onClick={() => setActivePhotoIdx(idx)}
                                                                                style={{
                                                                                    width: '64px',
                                                                                    height: '64px',
                                                                                    borderRadius: '8px',
                                                                                    overflow: 'hidden',
                                                                                    border: `2px solid ${isActive ? '#0D7A57' : '#CBD5E1'}`,
                                                                                    cursor: 'pointer',
                                                                                    backgroundColor: '#0F172A',
                                                                                    transition: 'all 0.15s ease',
                                                                                    transform: isActive ? 'scale(1.05)' : 'scale(1)'
                                                                                }}
                                                                            >
                                                                                <img src={url} alt={`Miniatura ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                                <span style={{ fontSize: '0.68rem', color: '#94A3B8', marginTop: '4px' }}>
                                                                    Haz clic en cualquier miniatura para inspeccionarla o en &quot;Ampliar&quot; para pantalla completa.
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    /* Compact Single-Row Notice for cases with no photos */
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748B', fontSize: '0.78rem' }}>
                                                            <CameraOff size={16} color="#94A3B8" />
                                                            <span>Este caso fue radicado por descripción telefónica / texto sin fotos adjuntas de origen.</span>
                                                        </div>
                                                        <div>
                                                            <input type="file" ref={fileInputRef} onChange={handleUploadEvidence} accept="image/*" style={{ display: 'none' }} />
                                                            <button
                                                                type="button"
                                                                disabled={uploadingPhoto}
                                                                onClick={() => fileInputRef.current?.click()}
                                                                style={{ backgroundColor: 'white', border: '1px solid #CBD5E1', padding: '5px 12px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '800', color: '#0D7A57', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                                            >
                                                                {uploadingPhoto ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                                                                <span>Adjuntar Foto de Evidencia</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    );
                                })()}

                                {/* Resolution Form & RCA Attribution (100% CARDS - ZERO CLUNKY DROPDOWNS) */}
                                {selectedPqr.status === 'pending' && (
                                    <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                        
                                        {/* 1. Concepto Comercial: 4 Interactive Visual Action Cards */}
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <label style={{ fontSize: '0.76rem', fontWeight: '900', textTransform: 'uppercase', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px', letterSpacing: '0.04em' }}>
                                                    <span>1. Concepto de Resolución Comercial</span>
                                                    <ProcessTooltip 
                                                        title="Conceptos de Compensación"
                                                        description="Define el impacto financiero y logístico: Opción 1 descarta el reclamo, Opción 2 alista un nuevo pedido, Opción 3 emite Nota Crédito, Opción 4 recalcula la factura con la cantidad real recibida."
                                                        worldClassTarget="Resolución en <60 min"
                                                    />
                                                </label>
                                                <span style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: '600' }}>
                                                    Selecciona con 1 clic o atajos <kbd style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '3px', padding: '1px 4px' }}>1-4</kbd>
                                                </span>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                                                {/* Card 1: Entregado Conforme */}
                                                <div 
                                                    onClick={() => setResolutionOption('opt1')}
                                                    style={{
                                                        backgroundColor: resolutionOption === 'opt1' ? '#ECFDF5' : '#FFFFFF',
                                                        border: `2px solid ${resolutionOption === 'opt1' ? '#0D7A57' : '#E2E8F0'}`,
                                                        borderRadius: '12px',
                                                        padding: '12px',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s ease',
                                                        boxShadow: resolutionOption === 'opt1' ? '0 4px 12px rgba(13, 122, 87, 0.12)' : 'none'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: resolutionOption === 'opt1' ? '#DCFCE7' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                            <CheckCircle2 size={16} color={resolutionOption === 'opt1' ? '#0D7A57' : '#64748B'} />
                                                        </div>
                                                        <span style={{ fontWeight: '900', fontSize: '0.82rem', color: resolutionOption === 'opt1' ? '#065F46' : '#1E293B' }}>
                                                            1. Cerrar Conforme
                                                        </span>
                                                    </div>
                                                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748B', lineHeight: '1.35' }}>
                                                        Calidad aceptada en estándar. Reclamo desestimado sin cambios en factura.
                                                    </p>
                                                </div>

                                                {/* Card 2: Reponer D+1 */}
                                                <div 
                                                    onClick={() => !isCurrentSelectedPqrReplacement && setResolutionOption('opt2')}
                                                    style={{
                                                        backgroundColor: isCurrentSelectedPqrReplacement ? '#FFFBEB' : resolutionOption === 'opt2' ? '#EFF6FF' : '#FFFFFF',
                                                        border: `2px solid ${isCurrentSelectedPqrReplacement ? '#FDE68A' : resolutionOption === 'opt2' ? '#2563EB' : '#E2E8F0'}`,
                                                        borderRadius: '12px',
                                                        padding: '12px',
                                                        cursor: isCurrentSelectedPqrReplacement ? 'not-allowed' : 'pointer',
                                                        opacity: isCurrentSelectedPqrReplacement ? 0.7 : 1,
                                                        transition: 'all 0.15s ease',
                                                        boxShadow: resolutionOption === 'opt2' ? '0 4px 12px rgba(37, 99, 235, 0.12)' : 'none'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: isCurrentSelectedPqrReplacement ? '#FEF3C7' : resolutionOption === 'opt2' ? '#DBEAFE' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                            <RotateCcw size={16} color={isCurrentSelectedPqrReplacement ? '#D97706' : resolutionOption === 'opt2' ? '#2563EB' : '#64748B'} />
                                                        </div>
                                                        <span style={{ fontWeight: '900', fontSize: '0.82rem', color: isCurrentSelectedPqrReplacement ? '#92400E' : resolutionOption === 'opt2' ? '#1E40AF' : '#1E293B' }}>
                                                            2. Reponer D+1
                                                        </span>
                                                    </div>
                                                    <p style={{ margin: 0, fontSize: '0.72rem', color: isCurrentSelectedPqrReplacement ? '#B45309' : '#64748B', lineHeight: '1.35' }}>
                                                        {isCurrentSelectedPqrReplacement ? 'Bloqueado: Corte de bucle anti-ping-pong activo.' : 'Alistar nuevo despacho prioritario con siguiente entrega.'}
                                                    </p>
                                                </div>

                                                {/* Card 3: Nota Crédito */}
                                                <div 
                                                    onClick={() => setResolutionOption('opt3')}
                                                    style={{
                                                        backgroundColor: resolutionOption === 'opt3' ? '#F5F3FF' : '#FFFFFF',
                                                        border: `2px solid ${resolutionOption === 'opt3' ? '#7C3AED' : '#E2E8F0'}`,
                                                        borderRadius: '12px',
                                                        padding: '12px',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s ease',
                                                        boxShadow: resolutionOption === 'opt3' ? '0 4px 12px rgba(124, 58, 237, 0.12)' : 'none'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: resolutionOption === 'opt3' ? '#EDE9FE' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                            <Receipt size={16} color={resolutionOption === 'opt3' ? '#7C3AED' : '#64748B'} />
                                                        </div>
                                                        <span style={{ fontWeight: '900', fontSize: '0.82rem', color: resolutionOption === 'opt3' ? '#5B21B6' : '#1E293B' }}>
                                                            3. Nota Crédito
                                                        </span>
                                                    </div>
                                                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748B', lineHeight: '1.35' }}>
                                                        Emitir descuento contable a favor del cliente en facturación.
                                                    </p>
                                                </div>

                                                {/* Card 4: Ajustar Factura */}
                                                <div 
                                                    onClick={() => setResolutionOption('opt4')}
                                                    style={{
                                                        backgroundColor: resolutionOption === 'opt4' ? '#FFFBEB' : '#FFFFFF',
                                                        border: `2px solid ${resolutionOption === 'opt4' ? '#D97706' : '#E2E8F0'}`,
                                                        borderRadius: '12px',
                                                        padding: '12px',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s ease',
                                                        boxShadow: resolutionOption === 'opt4' ? '0 4px 12px rgba(217, 119, 6, 0.12)' : 'none'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: resolutionOption === 'opt4' ? '#FEF3C7' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                            <Scale size={16} color={resolutionOption === 'opt4' ? '#D97706' : '#64748B'} />
                                                        </div>
                                                        <span style={{ fontWeight: '900', fontSize: '0.82rem', color: resolutionOption === 'opt4' ? '#92400E' : '#1E293B' }}>
                                                            4. Ajustar Factura
                                                        </span>
                                                    </div>
                                                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748B', lineHeight: '1.35' }}>
                                                        Recalcular valor a pagar liquidando solo la cantidad conforme recibida.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* 2. Causa Raíz (RCA) & Matriz de Imputabilidad (ZERO DROPDOWNS - 100% CARDS & PILLS) */}
                                        <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px' }}>
                                                <span style={{ fontSize: '0.78rem', fontWeight: '900', textTransform: 'uppercase', color: '#0D7A57', display: 'flex', alignItems: 'center', gap: '6px', letterSpacing: '0.04em' }}>
                                                    <Sparkles size={15} color="#0D7A57" />
                                                    2. Análisis Causa Raíz & Matriz de Imputabilidad
                                                </span>
                                                <RoleProcessGuide role="quality_auditor" compact sectionTitle="Norma RCA" />
                                            </div>

                                            {/* Macro-Causa L1 (Clickable Category Pills) */}
                                            <div>
                                                <label style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748B', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                                                    Macro-Causa del Defecto (L1):
                                                </label>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                    {RCA_CATEGORIES_L1.map(cat => {
                                                        const isSelected = rcaCategoryL1 === cat.code;
                                                        return (
                                                            <button
                                                                key={cat.code}
                                                                type="button"
                                                                onClick={() => {
                                                                    setRcaCategoryL1(cat.code);
                                                                    if (cat.subtypes.length > 0) {
                                                                        setRcaSubtypeL2(cat.subtypes[0].code);
                                                                        setRcaResponsible(cat.subtypes[0].typicalResponsible);
                                                                    }
                                                                }}
                                                                style={{
                                                                    padding: '6px 12px',
                                                                    borderRadius: '8px',
                                                                    fontSize: '0.74rem',
                                                                    fontWeight: isSelected ? '900' : '600',
                                                                    border: `1.5px solid ${isSelected ? '#0D7A57' : '#CBD5E1'}`,
                                                                    backgroundColor: isSelected ? '#EAEFEA' : '#FFFFFF',
                                                                    color: isSelected ? '#0D7A57' : '#334155',
                                                                    cursor: 'pointer',
                                                                    boxShadow: isSelected ? '0 2px 6px rgba(13, 122, 87, 0.15)' : 'none',
                                                                    transition: 'all 0.12s ease'
                                                                }}
                                                            >
                                                                {cat.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Subtipo L2 (Interactive Subtype Chips) */}
                                            <div>
                                                <label style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748B', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                                                    Subtipo Específico (L2):
                                                </label>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                    {selectedCategoryL1Obj?.subtypes.map(sub => {
                                                        const isSubSelected = rcaSubtypeL2 === sub.code;
                                                        return (
                                                            <button
                                                                key={sub.code}
                                                                type="button"
                                                                onClick={() => {
                                                                    setRcaSubtypeL2(sub.code);
                                                                    setRcaResponsible(sub.typicalResponsible);
                                                                }}
                                                                style={{
                                                                    padding: '5px 10px',
                                                                    borderRadius: '6px',
                                                                    fontSize: '0.72rem',
                                                                    fontWeight: isSubSelected ? '800' : '600',
                                                                    border: `1.5px solid ${isSubSelected ? '#0D7A57' : '#E2E8F0'}`,
                                                                    backgroundColor: isSubSelected ? '#0D7A57' : '#FFFFFF',
                                                                    color: isSubSelected ? '#FFFFFF' : '#475569',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.12s ease'
                                                                }}
                                                            >
                                                                {sub.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Matriz de Imputabilidad: 6 Department Cards */}
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                    <label style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase' }}>
                                                        <span>Área Responsable Imputable (¿Quién asume la pérdida?)</span>
                                                        <ProcessTooltip 
                                                            title="Matriz de Imputabilidad"
                                                            description="Asigna objetivamente la falla: Proveedor (Campo), Bodega (FIFO/Frío), Picking (Alistamiento), Transporte (Chofer), Comercial (Error de Montaje) o Cliente."
                                                            consequence="Define si se cobra al proveedor, se marca como merma de bodega o se evalúa error en ventas."
                                                        />
                                                    </label>
                                                </div>

                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                                                    {Object.values(RESPONSIBLE_PARTIES).map(resp => {
                                                        const isSelected = rcaResponsible === resp.code;
                                                        return (
                                                            <div 
                                                                key={resp.code}
                                                                onClick={() => setRcaResponsible(resp.code as any)}
                                                                style={{
                                                                    backgroundColor: isSelected ? resp.bgLight : '#FFFFFF',
                                                                    border: `2px solid ${isSelected ? resp.border : '#E2E8F0'}`,
                                                                    borderRadius: '10px',
                                                                    padding: '10px 8px',
                                                                    cursor: 'pointer',
                                                                    textAlign: 'center',
                                                                    transition: 'all 0.15s ease',
                                                                    boxShadow: isSelected ? '0 2px 8px rgba(0,0,0,0.06)' : 'none'
                                                                }}
                                                            >
                                                                <div style={{ color: isSelected ? resp.color : '#64748B', display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
                                                                    {getResponsibleIcon(resp.code)}
                                                                </div>
                                                                <div style={{ fontWeight: '900', fontSize: '0.76rem', color: isSelected ? resp.color : '#1E293B' }}>
                                                                    {resp.label}
                                                                </div>
                                                                <div style={{ fontSize: '0.64rem', color: '#94A3B8', marginTop: '2px' }}>
                                                                    {resp.department}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {/* Consecuencia Operativa Preview */}
                                                {selectedResponsibleObj && (
                                                    <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${selectedResponsibleObj.border}`, backgroundColor: selectedResponsibleObj.bgLight, color: selectedResponsibleObj.color, fontSize: '0.72rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <Sparkles size={13} color={selectedResponsibleObj.color} />
                                                        <span><strong>Efecto Operativo:</strong> {selectedResponsibleObj.operationalConsequence}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* 3. Notas de Resolución & Acciones Correctivas */}
                                        <div style={{ display: 'grid', gridTemplateColumns: selectedPqr.order_id ? '1.4fr 1fr' : '1fr', gap: '1.25rem', alignItems: 'start' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', display: 'block', marginBottom: '4px' }}>
                                                        3. Notas de Resolución & Acciones Correctivas
                                                    </label>
                                                    <textarea
                                                        value={resolutionNotes}
                                                        onChange={e => setResolutionNotes(e.target.value)}
                                                        placeholder="Describe las acciones acordadas con el cliente y los hallazgos técnicos de calidad..."
                                                        rows={3}
                                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.82rem', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
                                                    />
                                                </div>

                                                {/* Action Buttons */}
                                                <div style={{ display: 'flex', gap: '10px' }}>
                                                    <button 
                                                        disabled={actionLoading}
                                                        onClick={() => handleResolvePqr('resolved')}
                                                        style={{ flex: 1, backgroundColor: '#0D7A57', color: 'white', border: 'none', padding: '11px 18px', borderRadius: '10px', fontWeight: '900', fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxShadow: '0 2px 8px rgba(13, 122, 87, 0.25)' }}
                                                    >
                                                        <CheckCircle2 size={16} /> Resolver y Cerrar Caso
                                                    </button>
                                                    <button 
                                                        disabled={actionLoading}
                                                        onClick={() => handleResolvePqr('rejected')}
                                                        style={{ flex: 1, backgroundColor: '#FEE2E2', color: '#EF4444', border: '1px solid #FECACA', padding: '11px 18px', borderRadius: '10px', fontWeight: '900', fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                                    >
                                                        <AlertTriangle size={16} /> Rechazar / Archivar
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Order novelties interface (ONLY rendered when order_id exists!) */}
                                            {selectedPqr.order_id && (
                                                <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                    <h4 style={{ margin: 0, fontSize: '0.78rem', fontWeight: '900', color: '#0D7A57', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <CornerDownRight size={14} /> Registrar Novedad de Pedido
                                                    </h4>
                                                    
                                                    {loadingItems ? (
                                                        <div style={{ padding: '2rem 0', textAlign: 'center' }}><Loader2 className="animate-spin" size={20} style={{ color: '#0D7A57', margin: '0 auto' }} /></div>
                                                    ) : (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                            <div>
                                                                <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                                                                    Producto Afectado del Pedido:
                                                                </label>
                                                                {orderItems.length === 0 ? (
                                                                    <div style={{ fontSize: '0.72rem', color: '#94A3B8', padding: '8px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                                        Sin productos asociados a este pedido.
                                                                    </div>
                                                                ) : (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '140px', overflowY: 'auto' }}>
                                                                        {orderItems.map(item => {
                                                                            const isItemSel = selectedItemId === item.id;
                                                                            return (
                                                                                <div 
                                                                                    key={item.id}
                                                                                    onClick={() => setSelectedItemId(item.id)}
                                                                                    style={{
                                                                                        padding: '6px 10px',
                                                                                        borderRadius: '8px',
                                                                                        border: `1.5px solid ${isItemSel ? '#0D7A57' : '#E2E8F0'}`,
                                                                                        backgroundColor: isItemSel ? '#EAEFEA' : '#FFFFFF',
                                                                                        cursor: 'pointer',
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        justifyContent: 'space-between',
                                                                                        fontSize: '0.74rem',
                                                                                        transition: 'all 0.12s ease'
                                                                                    }}
                                                                                >
                                                                                    <span style={{ fontWeight: isItemSel ? '900' : '600', color: isItemSel ? '#0D7A57' : '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                                        {item.products?.name}
                                                                                    </span>
                                                                                    <span style={{ fontSize: '0.66rem', fontWeight: '800', color: isItemSel ? '#0D7A57' : '#64748B', backgroundColor: isItemSel ? '#DCFCE7' : '#F1F5F9', padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>
                                                                                        {item.quantity} {item.products?.unit_of_measure}
                                                                                    </span>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {selectedItemId && (
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px' }}>
                                                                    <div>
                                                                        <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Tipo de Novedad</label>
                                                                        <div style={{ display: 'flex', gap: '6px' }}>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setNoveltyType('faltante')}
                                                                                style={{
                                                                                    flex: 1,
                                                                                    padding: '5px 8px',
                                                                                    borderRadius: '6px',
                                                                                    border: `1.5px solid ${noveltyType === 'faltante' ? '#D97706' : '#E2E8F0'}`,
                                                                                    backgroundColor: noveltyType === 'faltante' ? '#FEF3C7' : '#FFFFFF',
                                                                                    color: noveltyType === 'faltante' ? '#92400E' : '#64748B',
                                                                                    fontWeight: noveltyType === 'faltante' ? '800' : '600',
                                                                                    fontSize: '0.7rem',
                                                                                    cursor: 'pointer',
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    justifyContent: 'center',
                                                                                    gap: '4px'
                                                                                }}
                                                                            >
                                                                                <PackageMinus size={12} /> Faltante
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setNoveltyType('averia')}
                                                                                style={{
                                                                                    flex: 1,
                                                                                    padding: '5px 8px',
                                                                                    borderRadius: '6px',
                                                                                    border: `1.5px solid ${noveltyType === 'averia' ? '#EF4444' : '#E2E8F0'}`,
                                                                                    backgroundColor: noveltyType === 'averia' ? '#FEE2E2' : '#FFFFFF',
                                                                                    color: noveltyType === 'averia' ? '#DC2626' : '#64748B',
                                                                                    fontWeight: noveltyType === 'averia' ? '800' : '600',
                                                                                    fontSize: '0.7rem',
                                                                                    cursor: 'pointer',
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    justifyContent: 'center',
                                                                                    gap: '4px'
                                                                                }}
                                                                            >
                                                                                <AlertTriangle size={12} /> Avería
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    <div>
                                                                        <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Cantidad Afectada</label>
                                                                        <input 
                                                                            type="number"
                                                                            value={noveltyQty}
                                                                            onChange={e => setNoveltyQty(Number(e.target.value))}
                                                                            min={1}
                                                                            style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.75rem', boxSizing: 'border-box', fontWeight: '700' }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {selectedItemId && (
                                                                <div>
                                                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748B', display: 'block', marginBottom: '3px', textTransform: 'uppercase' }}>Observación Contable</label>
                                                                    <input 
                                                                        type="text"
                                                                        value={noveltyReason}
                                                                        onChange={e => setNoveltyReason(e.target.value)}
                                                                        placeholder="Ej: Devolución parcial en descarga..."
                                                                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.75rem', boxSizing: 'border-box' }}
                                                                    />
                                                                </div>
                                                            )}

                                                            <button 
                                                                disabled={actionLoading || !selectedItemId || noveltyQty <= 0}
                                                                onClick={handleCreateNovelty}
                                                                style={{
                                                                    width: '100%',
                                                                    padding: '8px',
                                                                    borderRadius: '8px',
                                                                    fontWeight: '800',
                                                                    fontSize: '0.75rem',
                                                                    color: 'white',
                                                                    border: 'none',
                                                                    cursor: selectedItemId && noveltyQty > 0 ? 'pointer' : 'not-allowed',
                                                                    backgroundColor: selectedItemId && noveltyQty > 0 ? '#1E293B' : '#CBD5E1',
                                                                    transition: 'all 0.15s'
                                                                }}
                                                            >
                                                                Registrar Novedad y Descuento
                                                            </button>

                                                            <Link 
                                                                href={`/admin/orders/loading?orderId=${selectedPqr.order_id}`}
                                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: '700', color: '#0D7A57', textDecoration: 'none', marginTop: '4px' }}
                                                            >
                                                                <FileText size={12} /> Modificar pedido en Cargue de Pedidos <ArrowRight size={10} />
                                                            </Link>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Solved state display */}
                                {selectedPqr.status === 'resolved' && (
                                    <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #DCFCE7', borderRadius: '14px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <div style={{ fontWeight: '800', color: '#166534', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <CheckCircle2 size={18} color="#16A34A" /> Caso Resuelto y Archivado
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#15803D', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                                            {selectedPqr.resolution_notes}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                
                                {/* Welcome Hero Banner with Quick Start */}
                                <div style={{
                                    background: 'linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 50%, #F8FAFC 100%)',
                                    borderRadius: '18px',
                                    border: '1px solid #A7F3D0',
                                    padding: '1.75rem',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '1.25rem',
                                    boxShadow: '0 4px 16px rgba(13, 122, 87, 0.04)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', maxWidth: '640px' }}>
                                        <div style={{
                                            width: '48px',
                                            height: '48px',
                                            borderRadius: '14px',
                                            backgroundColor: '#DCFCE7',
                                            color: '#0D7A57',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                            boxShadow: '0 2px 8px rgba(13, 122, 87, 0.15)'
                                        }}>
                                            <HeartHandshake size={26} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                Centro de Experiencia FruFresco
                                            </div>
                                            <h2 style={{ margin: '4px 0 6px 0', fontSize: '1.35rem', fontWeight: '900', color: '#0F172A', letterSpacing: '-0.02em' }}>
                                                Resolución Ágil, Empatía y Calidad en Cada Entrega
                                            </h2>
                                            <p style={{ margin: 0, fontSize: '0.84rem', color: '#475569', lineHeight: '1.5' }}>
                                                Nuestra promesa con restaurantes y clientes institucionales no termina en el despacho. Cada novedad es atendida con equidad, protegiendo tanto la relación comercial como el margen logístico mediante análisis de causa raíz.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Quick Start Action Button */}
                                    <div>
                                        {firstPendingPqr ? (
                                            <button
                                                onClick={handleSelectFirstPending}
                                                style={{
                                                    backgroundColor: '#0D7A57',
                                                    color: 'white',
                                                    border: 'none',
                                                    padding: '12px 22px',
                                                    borderRadius: '12px',
                                                    fontWeight: '800',
                                                    fontSize: '0.84rem',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    boxShadow: '0 4px 14px rgba(13, 122, 87, 0.25)',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <Play size={16} />
                                                <span>Atender Primer Caso ({pendingPqrsCount} pendientes)</span>
                                            </button>
                                        ) : (
                                            <div style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                padding: '10px 18px',
                                                borderRadius: '12px',
                                                backgroundColor: '#DCFCE7',
                                                color: '#15803D',
                                                fontWeight: '800',
                                                fontSize: '0.82rem',
                                                border: '1px solid #BBF7D0'
                                            }}>
                                                <CheckCircle2 size={18} />
                                                <span>Todas las PQRs al día</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Protocolo de Excelencia Operativa en 3 Pasos */}
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '900', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <ShieldCheck size={20} color="#0D7A57" />
                                                Protocolo Operativo de Atención en 3 Pasos
                                            </h3>
                                            <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                                Estándar industrial FruFresco para una atención empática, rápida y sin reincidencia de mermas.
                                            </p>
                                        </div>
                                        <RoleProcessGuide role="customer_service_agent" compact sectionTitle="Manual CS" />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                                        {/* Step 1 */}
                                        <div style={{
                                            backgroundColor: '#F8FAFC',
                                            borderRadius: '14px',
                                            border: '1px solid #E2E8F0',
                                            padding: '1.25rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '10px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#E0F2FE', color: '#0369A1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Eye size={18} />
                                                </div>
                                                <span style={{ fontSize: '0.68rem', fontWeight: '900', color: '#94A3B8', letterSpacing: '0.05em' }}>
                                                    PASO 01
                                                </span>
                                            </div>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: '800', color: '#0F172A' }}>
                                                    Escucha Activa & Evidencia
                                                </h4>
                                                <p style={{ margin: '6px 0 0 0', fontSize: '0.76rem', color: '#475569', lineHeight: '1.45' }}>
                                                    Inspecciona fotos cargadas en sitio, remisiones de pesaje y la versión del chef o conductor para entender el hecho técnico con empatía y objetividad.
                                                </p>
                                            </div>
                                        </div>

                                        {/* Step 2 */}
                                        <div style={{
                                            backgroundColor: '#F8FAFC',
                                            borderRadius: '14px',
                                            border: '1px solid #E2E8F0',
                                            padding: '1.25rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '10px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#FEF3C7', color: '#B45309', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Zap size={18} />
                                                </div>
                                                <span style={{ fontSize: '0.68rem', fontWeight: '900', color: '#94A3B8', letterSpacing: '0.05em' }}>
                                                    PASO 02
                                                </span>
                                            </div>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: '800', color: '#0F172A' }}>
                                                    Solución Justa & Inmediata
                                                </h4>
                                                <p style={{ margin: '6px 0 0 0', fontSize: '0.76rem', color: '#475569', lineHeight: '1.45' }}>
                                                    Elige la vía idónea en &lt;45 min: reprogramar reposición prioritaria D+1 (Opción 2), emitir Nota Crédito (Opción 3) o ajustar la factura en caliente (Opción 4).
                                                </p>
                                            </div>
                                        </div>

                                        {/* Step 3 */}
                                        <div style={{
                                            backgroundColor: '#F8FAFC',
                                            borderRadius: '14px',
                                            border: '1px solid #E2E8F0',
                                            padding: '1.25rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '10px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#DCFCE7', color: '#15803D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <TrendingUp size={18} />
                                                </div>
                                                <span style={{ fontSize: '0.68rem', fontWeight: '900', color: '#94A3B8', letterSpacing: '0.05em' }}>
                                                    PASO 03
                                                </span>
                                            </div>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: '800', color: '#0F172A' }}>
                                                    Causa Raíz Lean (RCA)
                                                </h4>
                                                <p style={{ margin: '6px 0 0 0', fontSize: '0.76rem', color: '#475569', lineHeight: '1.45' }}>
                                                    Clasifica la falla (fisiología, golpe, frío) e imputa al área responsable (Campo, Bodega, Picking, Transporte) para erradicar la recurrencia de raíz.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Connection to RCA Dashboard */}
                                <div style={{
                                    backgroundColor: '#0F172A',
                                    borderRadius: '16px',
                                    padding: '1.5rem',
                                    color: 'white',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '1.25rem',
                                    boxShadow: '0 4px 16px rgba(15, 23, 42, 0.15)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', maxWidth: '600px' }}>
                                        <div style={{
                                            width: '46px',
                                            height: '46px',
                                            borderRadius: '12px',
                                            backgroundColor: 'rgba(52, 211, 153, 0.15)',
                                            color: '#34D399',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0
                                        }}>
                                            <BarChart2 size={24} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#34D399', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                Inteligencia de Calidad & Mejora Continua
                                            </div>
                                            <h4 style={{ margin: '2px 0 4px 0', fontSize: '1.05rem', fontWeight: '900', color: 'white' }}>
                                                Dashboard de Análisis Causa Raíz (RCA)
                                            </h4>
                                            <p style={{ margin: 0, fontSize: '0.78rem', color: '#94A3B8', lineHeight: '1.45' }}>
                                                Consulta los diagramas de Pareto de merma por proveedor, índices de daño en transporte y la matriz de imputabilidad de los últimos 90 días.
                                            </p>
                                        </div>
                                    </div>

                                    <Link
                                        href="/admin/customer-service/rca"
                                        style={{
                                            backgroundColor: '#0D7A57',
                                            color: 'white',
                                            padding: '10px 18px',
                                            borderRadius: '10px',
                                            fontWeight: '800',
                                            fontSize: '0.8rem',
                                            textDecoration: 'none',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            boxShadow: '0 2px 8px rgba(13, 122, 87, 0.3)',
                                            transition: 'background-color 0.15s'
                                        }}
                                    >
                                        <span>Ver Métricas RCA</span>
                                        <ChevronRight size={16} />
                                    </Link>
                                </div>

                                {/* Regla Anti-Ping-Pong de Protección de Fletes */}
                                <div style={{
                                    backgroundColor: '#FFFBEB',
                                    border: '1px solid #FDE68A',
                                    borderRadius: '14px',
                                    padding: '1.15rem 1.25rem',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '12px'
                                }}>
                                    <ShieldAlert size={22} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                                    <div>
                                        <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '900', color: '#92400E' }}>
                                            Regla de Corte de Bucle Logístico (Protección de Fletes)
                                        </h4>
                                        <p style={{ margin: '4px 0 0 0', fontSize: '0.76rem', color: '#B45309', lineHeight: '1.45' }}>
                                            Para evitar el &apos;Ping-Pong&apos; de reposiciones reiteradas que erosionan el margen del pedido, si un producto ya fue rechazado en reposición, el sistema bloquea automáticamente un tercer envío. La orden se liquida mediante <strong>Nota Crédito</strong> o <strong>Ajuste de Factura</strong>.
                                        </p>
                                    </div>
                                </div>

                                {/* Barra Informativa de Atajos Rápidos de Teclado */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.75rem 1rem',
                                    backgroundColor: '#F8FAFC',
                                    borderRadius: '10px',
                                    border: '1px solid #E2E8F0',
                                    fontSize: '0.72rem',
                                    color: '#64748B',
                                    flexWrap: 'wrap',
                                    gap: '8px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700' }}>
                                        <Sparkles size={14} color="#0D7A57" />
                                        <span>Flujo Ágil con Teclado:</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                                        <span><kbd style={{ background: 'white', border: '1px solid #CBD5E1', borderRadius: '4px', padding: '1px 5px', fontWeight: '800' }}>1</kbd> Entregado Conforme</span>
                                        <span><kbd style={{ background: 'white', border: '1px solid #CBD5E1', borderRadius: '4px', padding: '1px 5px', fontWeight: '800' }}>2</kbd> Reponer D+1</span>
                                        <span><kbd style={{ background: 'white', border: '1px solid #CBD5E1', borderRadius: '4px', padding: '1px 5px', fontWeight: '800' }}>3</kbd> Nota Crédito</span>
                                        <span><kbd style={{ background: 'white', border: '1px solid #CBD5E1', borderRadius: '4px', padding: '1px 5px', fontWeight: '800' }}>4</kbd> Ajustar Factura</span>
                                        <span><kbd style={{ background: 'white', border: '1px solid #CBD5E1', borderRadius: '4px', padding: '1px 5px', fontWeight: '800' }}>Ctrl + Enter</kbd> Resolver</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            {/* Fullscreen Photo Zoom Modal */}
            {zoomPhotoUrl && (
                <div 
                    onClick={() => setZoomPhotoUrl(null)} 
                    style={{ 
                        position: 'fixed', 
                        inset: 0, 
                        zIndex: 999999, 
                        backgroundColor: 'rgba(0,0,0,0.92)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        padding: '2rem', 
                        backdropFilter: 'blur(8px)' 
                    }}
                >
                    <button 
                        type="button"
                        onClick={() => setZoomPhotoUrl(null)} 
                        style={{ 
                            position: 'absolute', 
                            top: '24px', 
                            right: '24px', 
                            backgroundColor: 'rgba(255,255,255,0.2)', 
                            border: 'none', 
                            color: 'white', 
                            width: '44px', 
                            height: '44px', 
                            borderRadius: '50%', 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            transition: 'background-color 0.15s'
                        }}
                        title="Cerrar vista previa"
                    >
                        <X size={24} />
                    </button>
                    <img 
                        src={zoomPhotoUrl} 
                        alt="Evidencia fotográfica ampliada" 
                        style={{ 
                            maxWidth: '92vw', 
                            maxHeight: '92vh', 
                            objectFit: 'contain', 
                            borderRadius: '12px',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
                        }} 
                        onClick={e => e.stopPropagation()} 
                    />
                </div>
            )}
        </main>
    );
}
