'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
    MessageSquarePlus, X, Send, CheckCircle2,
    UploadCloud, Loader2, Search, User, Building2, UserCheck,
    ShieldAlert, Package, Settings, Users, Wrench, Clock, Sparkles, ChevronDown
} from 'lucide-react';
import { optimizeImageForUpload } from '@/lib/imageOptimizer';
import { buildRcaMetadataTag } from '@/lib/rcaTaxonomy';

interface ClientProfile {
    id: string;
    company_name: string;
    contact_name: string;
    nit: string;
    email: string;
    address?: string;
    parent_id?: string | null;
    corporate_role?: string | null;
    is_corporate_parent?: boolean | null;
}

interface CollaboratorItem {
    id: string;
    contact_name: string;
    role: string;
}

type ScopeMode = 'client' | 'internal';
type InternalSubscope = 'rrhh_convivencia' | 'proceso_planta' | 'equipos_sst';

interface InternalPreset {
    id: string;
    label: string;
    subscope: InternalSubscope;
    categoryL1: string;
    subtypeL2: string;
    defaultArea: string;
    defaultType: 'queja' | 'reclamo' | 'peticion' | 'sugerencia';
    defaultPriority: 'low' | 'normal' | 'high' | 'urgent';
    subjectTemplate: string;
}

const INTERNAL_PRESETS: InternalPreset[] = [
    // RRHH & Convivencia
    {
        id: 'llegada_tarde',
        label: 'Llegada tarde a turno',
        subscope: 'rrhh_convivencia',
        categoryL1: 'talento_humano_disciplina',
        subtypeL2: 'llegada_tarde_turno',
        defaultArea: 'Picking / Alistamiento',
        defaultType: 'queja',
        defaultPriority: 'normal',
        subjectTemplate: 'Llegada tarde a turno programado'
    },
    {
        id: 'falta_respeto',
        label: 'Falta de respeto / Convivencia',
        subscope: 'rrhh_convivencia',
        categoryL1: 'talento_humano_disciplina',
        subtypeL2: 'falta_respeto_convivencia',
        defaultArea: 'Bodega / Recepción',
        defaultType: 'queja',
        defaultPriority: 'high',
        subjectTemplate: 'Falta de respeto / Incidente de convivencia en planta'
    },
    {
        id: 'desacato_instruccion',
        label: 'Desacato de instrucción',
        subscope: 'rrhh_convivencia',
        categoryL1: 'talento_humano_disciplina',
        subtypeL2: 'desacato_instruccion_operativa',
        defaultArea: 'Bodega / Recepción',
        defaultType: 'reclamo',
        defaultPriority: 'high',
        subjectTemplate: 'Desacato de instrucción operativa en turno'
    },
    {
        id: 'incumplimiento_epp',
        label: 'Incumplimiento EPP / BPM',
        subscope: 'rrhh_convivencia',
        categoryL1: 'talento_humano_disciplina',
        subtypeL2: 'incumplimiento_epp_bpm',
        defaultArea: 'Picking / Alistamiento',
        defaultType: 'queja',
        defaultPriority: 'normal',
        subjectTemplate: 'Incumplimiento de dotación EPP o normas BPM'
    },
    // Proceso & Sincronización de Planta
    {
        id: 'lanzamiento_tardio',
        label: 'Lanzamiento tardío de operación',
        subscope: 'proceso_planta',
        categoryL1: 'proceso_operativo_interno',
        subtypeL2: 'lanzamiento_tardio_operacion',
        defaultArea: 'Comercial / Programación',
        defaultType: 'reclamo',
        defaultPriority: 'high',
        subjectTemplate: 'Lanzamiento tardío de operación afectó salida de rutas'
    },
    {
        id: 'retraso_salida_flota',
        label: 'Retraso en salida de flota / muelle',
        subscope: 'proceso_planta',
        categoryL1: 'proceso_operativo_interno',
        subtypeL2: 'retraso_salida_flota_muelle',
        defaultArea: 'Transporte / Despachos',
        defaultType: 'reclamo',
        defaultPriority: 'high',
        subjectTemplate: 'Retraso en cargue y salida de flota en muelle'
    },
    {
        id: 'demora_abastecimiento',
        label: 'Entrada tardía de mercancía de plaza',
        subscope: 'proceso_planta',
        categoryL1: 'proceso_operativo_interno',
        subtypeL2: 'demora_recepcion_abastecimiento',
        defaultArea: 'Compras / Abastecimiento',
        defaultType: 'queja',
        defaultPriority: 'high',
        subjectTemplate: 'Demora en ingreso de mercancía de plaza al muelle'
    },
    // Equipos, SST & 5S
    {
        id: 'falla_bascula',
        label: 'Falla de báscula / impresora',
        subscope: 'equipos_sst',
        categoryL1: 'proceso_operativo_interno',
        subtypeL2: 'falla_equipos_bascula_sistema',
        defaultArea: 'Picking / Alistamiento',
        defaultType: 'peticion',
        defaultPriority: 'high',
        subjectTemplate: 'Falla técnica en báscula / impresora de alistamiento'
    },
    {
        id: 'novedad_cava',
        label: 'Novedad en cuarto frío / cava',
        subscope: 'equipos_sst',
        categoryL1: 'proceso_operativo_interno',
        subtypeL2: 'falla_equipos_bascula_sistema',
        defaultArea: 'Bodega / Recepción',
        defaultType: 'reclamo',
        defaultPriority: 'urgent',
        subjectTemplate: 'Anomalía operativa en cuarto frío / infraestructura'
    },
    {
        id: 'orden_aseo_5s',
        label: 'Incumplimiento Orden y Aseo (5S)',
        subscope: 'equipos_sst',
        categoryL1: 'talento_humano_disciplina',
        subtypeL2: 'incumplimiento_epp_bpm',
        defaultArea: 'Bodega / Recepción',
        defaultType: 'queja',
        defaultPriority: 'normal',
        subjectTemplate: 'Novedad de entrega de turno / Orden y Aseo (5S)'
    }
];

const INTERNAL_AREAS = [
    'Picking / Alistamiento',
    'Bodega / Recepción',
    'Transporte / Despachos',
    'Comercial / Programación',
    'Compras / Abastecimiento',
    'Administración / RRHH'
];

export default function PQRFloatingWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Scope Switcher: 'client' (Externo) vs 'internal' (Planta / RRHH / Proceso)
    const [scopeMode, setScopeMode] = useState<ScopeMode>('client');

    // Clients search state (for 'client' scope)
    const [clients, setClients] = useState<ClientProfile[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedClient, setSelectedClient] = useState<ClientProfile | null>(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [highlightedClientIndex, setHighlightedClientIndex] = useState(0);

    // Recent orders for selected operational branch
    const [branchOrders, setBranchOrders] = useState<Array<{ id: string; sequence_id: number; total: number; delivery_date?: string; created_at: string; status: string }>>([]);
    const [selectedOrderId, setSelectedOrderId] = useState<string>('');
    const [loadingOrders, setLoadingOrders] = useState(false);

    // Internal Scope state (for 'internal' scope)
    const [internalSubscope, setInternalSubscope] = useState<InternalSubscope>('rrhh_convivencia');
    const [internalArea, setInternalArea] = useState<string>('Picking / Alistamiento');
    const [internalCategoryL1, setInternalCategoryL1] = useState<string>('talento_humano_disciplina');
    const [internalSubtypeL2, setInternalSubtypeL2] = useState<string>('llegada_tarde_turno');
    const [selectedPresetId, setSelectedPresetId] = useState<string>('');
    const [involvedCollaborator, setInvolvedCollaborator] = useState<CollaboratorItem | null>(null);
    const [involvedCollabQuery, setInvolvedCollabQuery] = useState('');
    const [showInvolvedCollabDropdown, setShowInvolvedCollabDropdown] = useState(false);

    // Collaborator / Reporter state
    const [collaborators, setCollaborators] = useState<CollaboratorItem[]>([]);
    const [selectedCollaborator, setSelectedCollaborator] = useState<CollaboratorItem | null>(null);
    const [changingReporter, setChangingReporter] = useState(false);

    // Form state
    const [type, setType] = useState<'queja' | 'reclamo' | 'peticion' | 'sugerencia'>('reclamo');
    const [category, setCategory] = useState<'producto' | 'entrega' | 'facturacion' | 'otro'>('producto');
    const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [files, setFiles] = useState<FileList | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const dropdownRef = useRef<HTMLDivElement>(null);
    const involvedCollabRef = useRef<HTMLDivElement>(null);

    // Global Escape key listener to close widget cleanly
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (showDropdown) {
                    setShowDropdown(false);
                } else if (showInvolvedCollabDropdown) {
                    setShowInvolvedCollabDropdown(false);
                } else {
                    setIsOpen(false);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, showDropdown, showInvolvedCollabDropdown]);

    useEffect(() => {
        if (isOpen && clients.length === 0) {
            fetchClients();
        }
        if (isOpen && collaborators.length === 0) {
            fetchCollaboratorsAndCurrentUser();
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
            if (involvedCollabRef.current && !involvedCollabRef.current.contains(event.target as Node)) {
                setShowInvolvedCollabDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Preview image cleanup
    useEffect(() => {
        if (!files || files.length === 0) {
            setPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(files[0]);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [files]);

    const fetchClients = async () => {
        try {
            const { data } = await supabase
                .from('profiles')
                .select('id, company_name, contact_name, nit, email, address, parent_id, corporate_role, is_corporate_parent')
                .not('company_name', 'is', null)
                .order('company_name');
            if (data) setClients(data);
        } catch (err) {
            console.error('Error fetching clients for PQR:', err);
        }
    };

    // Poka-Yoke SDD v1.9.253: Identify pure Parent Matrices that have child branches.
    const parentMatrixIds = useMemo(() => {
        const ids = new Set<string>();
        clients.forEach(c => {
            if (c.parent_id) ids.add(c.parent_id);
        });
        return ids;
    }, [clients]);

    const parentMap = useMemo(() => {
        const map = new Map<string, ClientProfile>();
        clients.forEach(c => map.set(c.id, c));
        return map;
    }, [clients]);

    const deliverableClients = useMemo(() => {
        return clients.filter(c => !parentMatrixIds.has(c.id));
    }, [clients, parentMatrixIds]);

    const fetchBranchOrders = async (branchId: string) => {
        setLoadingOrders(true);
        try {
            const { data } = await supabase
                .from('orders')
                .select('id, sequence_id, total, delivery_date, created_at, status')
                .eq('profile_id', branchId)
                .neq('status', 'cancelled')
                .order('created_at', { ascending: false })
                .limit(12);
            const list = data || [];
            setBranchOrders(list);
            if (list.length > 0) {
                setSelectedOrderId(list[0].id);
            } else {
                setSelectedOrderId('');
            }
        } catch (err) {
            console.error('Error fetching branch orders for PQR:', err);
            setBranchOrders([]);
        } finally {
            setLoadingOrders(false);
        }
    };

    const fetchCollaboratorsAndCurrentUser = async () => {
        try {
            const [collabRes, authRes] = await Promise.all([
                supabase
                    .from('collaborators')
                    .select('id, contact_name, role')
                    .eq('is_active', true)
                    .order('contact_name'),
                supabase.auth.getUser()
            ]);

            const collabList: CollaboratorItem[] = collabRes.data || [];
            setCollaborators(collabList);

            const user = authRes.data?.user;
            if (user) {
                const { data: prof } = await supabase
                    .from('profiles')
                    .select('id, contact_name, company_name, role')
                    .eq('id', user.id)
                    .maybeSingle();

                const fullName = prof?.contact_name || prof?.company_name || user.user_metadata?.full_name || user.email?.split('@')[0] || '';
                const matched = collabList.find(c =>
                    c.contact_name.toLowerCase() === fullName.toLowerCase() ||
                    (fullName && c.contact_name.toLowerCase().includes(fullName.toLowerCase()))
                );

                if (matched) {
                    setSelectedCollaborator(matched);
                } else if (fullName) {
                    setSelectedCollaborator({
                        id: user.id,
                        contact_name: fullName,
                        role: prof?.role || 'Ejecutivo SAC / Operaciones'
                    });
                } else if (collabList.length > 0) {
                    setSelectedCollaborator(collabList[0]);
                }
            } else if (collabList.length > 0) {
                setSelectedCollaborator(collabList[0]);
            }
        } catch (err) {
            console.error('Error fetching collaborators for PQR widget:', err);
        }
    };

    const filteredClients = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        if (!q) return deliverableClients.slice(0, 15);
        return deliverableClients.filter(c => {
            const parent = c.parent_id ? parentMap.get(c.parent_id) : null;
            return (
                (c.company_name && c.company_name.toLowerCase().includes(q)) ||
                (c.contact_name && c.contact_name.toLowerCase().includes(q)) ||
                (c.nit && c.nit.toLowerCase().includes(q)) ||
                (c.address && c.address.toLowerCase().includes(q)) ||
                (parent?.company_name && parent.company_name.toLowerCase().includes(q)) ||
                (parent?.nit && parent.nit.toLowerCase().includes(q))
            );
        }).slice(0, 20);
    }, [deliverableClients, parentMap, searchQuery]);

    const filteredInvolvedCollabs = useMemo(() => {
        const q = involvedCollabQuery.toLowerCase().trim();
        if (!q) return collaborators;
        return collaborators.filter(c =>
            c.contact_name.toLowerCase().includes(q) ||
            (c.role && c.role.toLowerCase().includes(q))
        );
    }, [collaborators, involvedCollabQuery]);

    const activePresets = useMemo(() => {
        return INTERNAL_PRESETS.filter(p => p.subscope === internalSubscope);
    }, [internalSubscope]);

    const handleSelectSubscope = (sub: InternalSubscope) => {
        setInternalSubscope(sub);
        setSelectedPresetId('');
        if (sub === 'rrhh_convivencia') {
            setInternalCategoryL1('talento_humano_disciplina');
            setInternalSubtypeL2('llegada_tarde_turno');
            setType('queja');
        } else if (sub === 'proceso_planta') {
            setInternalCategoryL1('proceso_operativo_interno');
            setInternalSubtypeL2('lanzamiento_tardio_operacion');
            setType('reclamo');
        } else {
            setInternalCategoryL1('proceso_operativo_interno');
            setInternalSubtypeL2('falla_equipos_bascula_sistema');
            setType('peticion');
        }
    };

    const handleApplyPreset = (preset: InternalPreset) => {
        setSelectedPresetId(preset.id);
        setInternalCategoryL1(preset.categoryL1);
        setInternalSubtypeL2(preset.subtypeL2);
        setInternalArea(preset.defaultArea);
        setType(preset.defaultType);
        setPriority(preset.defaultPriority);
        setSubject(preset.subjectTemplate);
        setErrorMsg(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);

        if (scopeMode === 'client' && !selectedClient) {
            setErrorMsg('Selecciona una sucursal operativa para vincular la PQR comercial.');
            return;
        }
        if (!subject.trim()) {
            setErrorMsg('Ingresa un asunto claro para identificar el caso.');
            return;
        }

        setLoading(true);
        try {
            let primaryPhotoUrl = null;
            const additionalPhotos: string[] = [];

            if (files && files.length > 0) {
                for (let i = 0; i < files.length; i++) {
                    const rawFile = files[i];
                    const file = await optimizeImageForUpload(rawFile);
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                    const filePath = `pqr_evidence/${fileName}`;

                    const { error: uploadError } = await supabase.storage
                        .from('public_assets')
                        .upload(filePath, file);

                    if (!uploadError) {
                        const { data } = supabase.storage
                            .from('public_assets')
                            .getPublicUrl(filePath);

                        if (i === 0) primaryPhotoUrl = data.publicUrl;
                        else additionalPhotos.push(data.publicUrl);
                    }
                }
            }

            const reporterHeader = selectedCollaborator
                ? `[Radicado por Colaborador FruFresco: ${selectedCollaborator.contact_name} (${selectedCollaborator.role})]`
                : `[Radicado por Colaborador FruFresco: Mesa de Ayuda SAC]`;

            if (scopeMode === 'internal') {
                const areaLower = internalArea.toLowerCase();
                const responsibleCode =
                    areaLower.includes('picking') || areaLower.includes('alistamiento') ? 'picking' :
                    areaLower.includes('transporte') || areaLower.includes('despacho') ? 'transporte' :
                    areaLower.includes('comercial') || areaLower.includes('programaci') ? 'comercial' :
                    areaLower.includes('compra') || areaLower.includes('abastecimiento') ? 'proveedor' :
                    'bodega';

                const internalHeader = `[ÁMBITO: INTERNO | SUBTIPO: ${internalSubscope} | ÁREA: ${internalArea} | COLABORADOR: ${involvedCollaborator ? `${involvedCollaborator.contact_name} (${involvedCollaborator.role})` : 'N/A (Proceso General)'}${involvedCollaborator ? ` | COLAB_ID: ${involvedCollaborator.id}` : ''}]`;

                const rcaTag = buildRcaMetadataTag({
                    categoryL1: internalCategoryL1,
                    subtypeL2: internalSubtypeL2,
                    responsible: responsibleCode,
                    notes: description.trim(),
                    imputedTargetType: involvedCollaborator ? 'employee' : 'none',
                    imputedEntityId: involvedCollaborator?.id || '',
                    imputedEntityName: involvedCollaborator?.contact_name || '',
                    imputedEntities: involvedCollaborator ? [{
                        id: involvedCollaborator.id,
                        name: involvedCollaborator.contact_name,
                        role: involvedCollaborator.role || internalArea,
                        entityType: 'employee',
                        sharePercent: 100,
                        deductionAmount: 0
                    }] : []
                });

                const finalSubject = subject.trim().startsWith('[INTERNA')
                    ? subject.trim()
                    : `[INTERNA - ${internalArea}] ${subject.trim()}`;

                const finalDescription = `${reporterHeader}\n${internalHeader}\n\n${description.trim()}\n\n${rcaTag}`;

                const { error } = await supabase
                    .from('customer_service_pqrs')
                    .insert({
                        client_id: null,
                        order_id: null,
                        type,
                        category: 'otro',
                        priority,
                        subject: finalSubject,
                        description: finalDescription,
                        primary_photo_url: primaryPhotoUrl,
                        additional_photos: additionalPhotos.length > 0 ? additionalPhotos : null,
                        status: 'pending'
                    });

                if (error) throw error;
            } else {
                const finalDescription = `${reporterHeader}\n\n${description.trim()}`;

                const { error } = await supabase
                    .from('customer_service_pqrs')
                    .insert({
                        client_id: selectedClient!.id,
                        order_id: selectedOrderId || null,
                        type,
                        category,
                        priority,
                        subject: subject.trim(),
                        description: finalDescription,
                        primary_photo_url: primaryPhotoUrl,
                        additional_photos: additionalPhotos.length > 0 ? additionalPhotos : null,
                        status: 'pending'
                    });

                if (error) throw error;
            }

            setSubmitted(true);
            setTimeout(() => {
                setSubmitted(false);
                setIsOpen(false);
                setSubject('');
                setDescription('');
                setFiles(null);
                setSelectedClient(null);
                setSearchQuery('');
                setBranchOrders([]);
                setSelectedOrderId('');
                setSelectedPresetId('');
                setInvolvedCollaborator(null);
                setInvolvedCollabQuery('');
            }, 1800);

        } catch (err: any) {
            console.error('Error submitting PQR:', err);
            setErrorMsg('Error al guardar el reporte: ' + (err.message || 'Verifica tu conexión.'));
        } finally {
            setLoading(false);
        }
    };

    const labelStyle: React.CSSProperties = {
        display: 'block',
        fontSize: '0.68rem',
        fontWeight: 800,
        color: '#475569',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: '5px'
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    backgroundColor: '#0F172A',
                    color: '#FFFFFF',
                    borderRadius: '999px',
                    padding: '10px 18px 10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    boxShadow: '0 12px 28px -6px rgba(15, 23, 42, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                    border: '1px solid #1E293B',
                    cursor: 'pointer',
                    zIndex: 9999,
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    fontFamily: 'var(--font-inter), sans-serif'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.backgroundColor = '#1E293B';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.backgroundColor = '#0F172A';
                }}
                title="Radicar PQR Comercial o Novedad Interna de Planta"
            >
                <div style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    backgroundColor: '#0D7A57',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 12px rgba(16, 185, 129, 0.4)'
                }}>
                    <MessageSquarePlus size={16} color="#FFFFFF" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '-0.01em' }}>Radicar PQR / Novedad</span>
                    <span style={{ fontSize: '0.63rem', color: '#94A3B8', fontWeight: 600 }}>Clientes • Planta • RRHH</span>
                </div>
            </button>
        );
    }

    return (
        <div style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '450px',
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: 'calc(100vh - 40px)',
            backgroundColor: '#FFFFFF',
            borderRadius: '18px',
            boxShadow: '0 24px 48px -12px rgba(15, 23, 42, 0.32), 0 0 0 1px rgba(15, 23, 42, 0.08)',
            border: '1px solid #CBD5E1',
            zIndex: 9999,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'var(--font-inter), sans-serif',
            animation: 'slideUp 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
            {/* 1. OBSIDIAN SLATE HEADER (Skin 1 Design Manual) */}
            <div style={{
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                padding: '14px 18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #1E293B',
                flexShrink: 0
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        backgroundColor: scopeMode === 'client' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                        border: scopeMode === 'client' ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(56, 189, 248, 0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}>
                        {scopeMode === 'client' ? (
                            <ShieldAlert size={19} color="#34D399" />
                        ) : (
                            <Settings size={19} color="#38BDF8" />
                        )}
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 style={{
                                margin: 0,
                                fontSize: '0.95rem',
                                fontWeight: 800,
                                letterSpacing: '-0.01em',
                                fontFamily: 'var(--font-outfit), sans-serif',
                                color: '#FFFFFF'
                            }}>
                                Radicar PQR / Novedad
                            </h3>
                            <span style={{
                                fontSize: '0.62rem',
                                fontWeight: 800,
                                padding: '2px 7px',
                                borderRadius: '999px',
                                backgroundColor: scopeMode === 'client' ? 'rgba(16, 185, 129, 0.18)' : 'rgba(56, 189, 248, 0.18)',
                                color: scopeMode === 'client' ? '#6EE7B7' : '#7DD3FC',
                                border: scopeMode === 'client' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)'
                            }}>
                                {scopeMode === 'client' ? 'COMERCIAL' : 'PLANTA & RRHH'}
                            </span>
                        </div>
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.71rem', color: '#94A3B8', fontWeight: 500 }}>
                            {scopeMode === 'client'
                                ? 'Reclamación de cliente vinculada a sucursal y pedido'
                                : 'Reporte interno de operación, convivencia o equipos'}
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#CBD5E1',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease'
                    }}
                    title="Cerrar (Esc)"
                >
                    <X size={16} />
                </button>
            </div>

            {/* 2. BODY CONTENT */}
            {submitted ? (
                <div style={{ padding: '44px 24px', textAlign: 'center', backgroundColor: '#FFFFFF' }}>
                    <div style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '16px',
                        backgroundColor: '#ECFDF5',
                        border: '1px solid #A7F3D0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 14px auto'
                    }}>
                        <CheckCircle2 size={30} color="#0D7A57" />
                    </div>
                    <h4 style={{ fontSize: '1.08rem', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0', fontFamily: 'var(--font-outfit), sans-serif' }}>
                        {scopeMode === 'client' ? 'PQR Comercial Radicada' : 'Novedad Interna Registrada'}
                    </h4>
                    <p style={{ fontSize: '0.82rem', color: '#64748B', margin: 0, lineHeight: 1.45 }}>
                        {scopeMode === 'client'
                            ? 'El caso fue vinculado a la sucursal operativa y está disponible en la consola de Gestión de Calidad.'
                            : 'La incidencia interna quedó clasificada en la consola de Calidad sin afectar el FTR comercial de clientes.'}
                    </p>
                </div>
            ) : (
                <form
                    onSubmit={handleSubmit}
                    style={{
                        padding: '14px 16px 16px 16px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        backgroundColor: '#FFFFFF'
                    }}
                >
                    {/* A. DUAL-SCOPE SEGMENTED SWITCHER */}
                    <div>
                        <label style={labelStyle}>1. Ámbito de la Novedad</label>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '4px',
                            backgroundColor: '#F1F5F9',
                            padding: '4px',
                            borderRadius: '11px',
                            border: '1px solid #CBD5E1'
                        }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setScopeMode('client');
                                    setErrorMsg(null);
                                }}
                                style={{
                                    padding: '8px 10px',
                                    borderRadius: '8px',
                                    border: scopeMode === 'client' ? '1px solid #CBD5E1' : '1px solid transparent',
                                    backgroundColor: scopeMode === 'client' ? '#FFFFFF' : 'transparent',
                                    color: scopeMode === 'client' ? '#0F172A' : '#64748B',
                                    fontWeight: scopeMode === 'client' ? 800 : 600,
                                    fontSize: '0.76rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    boxShadow: scopeMode === 'client' ? '0 1px 3px rgba(15, 23, 42, 0.08)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <Building2 size={14} color={scopeMode === 'client' ? '#0D7A57' : '#64748B'} />
                                <span>Cliente / Pedido</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setScopeMode('internal');
                                    setErrorMsg(null);
                                    if (!subject && !selectedPresetId) {
                                        handleSelectSubscope(internalSubscope);
                                    }
                                }}
                                style={{
                                    padding: '8px 10px',
                                    borderRadius: '8px',
                                    border: scopeMode === 'internal' ? '1px solid #CBD5E1' : '1px solid transparent',
                                    backgroundColor: scopeMode === 'internal' ? '#FFFFFF' : 'transparent',
                                    color: scopeMode === 'internal' ? '#0F172A' : '#64748B',
                                    fontWeight: scopeMode === 'internal' ? 800 : 600,
                                    fontSize: '0.76rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    boxShadow: scopeMode === 'internal' ? '0 1px 3px rgba(15, 23, 42, 0.08)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <Settings size={14} color={scopeMode === 'internal' ? '#0284C7' : '#64748B'} />
                                <span>Interna / Planta & RRHH</span>
                            </button>
                        </div>
                    </div>

                    {/* B. REPORTER BAR (Compact Swiss Slate Card) */}
                    <div style={{
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '10px',
                        padding: '8px 11px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                <div style={{
                                    width: '26px',
                                    height: '26px',
                                    borderRadius: '7px',
                                    backgroundColor: '#EAEFEA',
                                    border: '1px solid #C4D7C4',
                                    color: '#0D7A57',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    <UserCheck size={14} />
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        Reportado por
                                    </div>
                                    <div style={{ fontSize: '0.77rem', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {selectedCollaborator ? `${selectedCollaborator.contact_name} • ${selectedCollaborator.role}` : 'Mesa Operativa FruFresco'}
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setChangingReporter(!changingReporter)}
                                style={{
                                    background: '#FFFFFF',
                                    border: '1px solid #CBD5E1',
                                    borderRadius: '6px',
                                    padding: '3px 8px',
                                    fontSize: '0.66rem',
                                    fontWeight: 700,
                                    color: '#334155',
                                    cursor: 'pointer',
                                    flexShrink: 0
                                }}
                            >
                                {changingReporter ? 'Listo' : 'Cambiar'}
                            </button>
                        </div>

                        {changingReporter && (
                            <select
                                value={selectedCollaborator?.id || ''}
                                onChange={(e) => {
                                    const found = collaborators.find(c => c.id === e.target.value);
                                    if (found) setSelectedCollaborator(found);
                                    setChangingReporter(false);
                                }}
                                style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    borderRadius: '7px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.76rem',
                                    backgroundColor: '#FFFFFF',
                                    color: '#0F172A',
                                    fontWeight: 600,
                                    outline: 'none'
                                }}
                            >
                                <option value="" disabled>Selecciona tu nombre...</option>
                                {collaborators.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.contact_name} — {c.role}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* C. SCOPE-SPECIFIC BLOCK */}
                    {scopeMode === 'client' ? (
                        /* ================= ÁMBITO EXTERNO: CLIENTE & PEDIDO ================= */
                        <>
                            <div ref={dropdownRef} style={{ position: 'relative' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                                    <label style={{ ...labelStyle, marginBottom: 0 }}>2. Sucursal / Cliente Operativo *</label>
                                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#0D7A57', backgroundColor: '#ECFDF5', padding: '1px 6px', borderRadius: '4px', border: '1px solid #A7F3D0' }}>
                                        Poka-Yoke Sede Activo
                                    </span>
                                </div>

                                {selectedClient ? (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '9px 12px',
                                        backgroundColor: '#F0FDF4',
                                        border: '1px solid #86EFAC',
                                        borderRadius: '10px',
                                        fontSize: '0.82rem',
                                        color: '#065F46'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                            <Building2 size={16} color="#0D7A57" style={{ flexShrink: 0 }} />
                                            <div style={{ truncate: 'true', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as any}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <strong style={{ color: '#0F172A' }}>{selectedClient.company_name || selectedClient.contact_name}</strong>
                                                    {selectedClient.parent_id && (
                                                        <span style={{ fontSize: '0.6rem', fontWeight: 800, backgroundColor: '#DCFCE7', color: '#166534', padding: '1px 5px', borderRadius: '4px' }}>
                                                            SUCURSAL
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: '#047857', marginTop: '1px' }}>
                                                    {selectedClient.parent_id && parentMap.get(selectedClient.parent_id)
                                                        ? `Matriz: ${parentMap.get(selectedClient.parent_id)?.company_name} • `
                                                        : ''}
                                                    {selectedClient.address || (selectedClient.nit ? `NIT: ${selectedClient.nit}` : 'Sede Operativa')}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedClient(null);
                                                setBranchOrders([]);
                                                setSelectedOrderId('');
                                            }}
                                            style={{
                                                background: '#FFFFFF',
                                                border: '1px solid #A7F3D0',
                                                borderRadius: '6px',
                                                width: '24px',
                                                height: '24px',
                                                cursor: 'pointer',
                                                color: '#047857',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0
                                            }}
                                            title="Cambiar sucursal"
                                        >
                                            <X size={13} />
                                        </button>
                                    </div>
                                ) : (
                                    <div>
                                        <div style={{ position: 'relative' }}>
                                            <Search size={15} style={{ position: 'absolute', left: '11px', top: '10px', color: '#64748B' }} />
                                            <input
                                                type="text"
                                                placeholder="Buscar sucursal, matriz, NIT o dirección..."
                                                value={searchQuery}
                                                onChange={(e) => {
                                                    setSearchQuery(e.target.value);
                                                    setShowDropdown(true);
                                                    setHighlightedClientIndex(0);
                                                    setErrorMsg(null);
                                                }}
                                                onFocus={() => setShowDropdown(true)}
                                                onKeyDown={(e) => {
                                                    if (!showDropdown || filteredClients.length === 0) return;
                                                    if (e.key === 'ArrowDown') {
                                                        e.preventDefault();
                                                        setHighlightedClientIndex(prev => (prev + 1) % filteredClients.length);
                                                    } else if (e.key === 'ArrowUp') {
                                                        e.preventDefault();
                                                        setHighlightedClientIndex(prev => (prev - 1 + filteredClients.length) % filteredClients.length);
                                                    } else if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        const chosen = filteredClients[highlightedClientIndex] || filteredClients[0];
                                                        if (chosen) {
                                                            setSelectedClient(chosen);
                                                            setShowDropdown(false);
                                                            setErrorMsg(null);
                                                            fetchBranchOrders(chosen.id);
                                                        }
                                                    }
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '8px 12px 8px 34px',
                                                    borderRadius: '9px',
                                                    border: '1px solid #CBD5E1',
                                                    fontSize: '0.8rem',
                                                    color: '#0F172A',
                                                    backgroundColor: '#F8FAFC',
                                                    outline: 'none'
                                                }}
                                            />
                                        </div>

                                        {showDropdown && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '100%',
                                                left: 0,
                                                right: 0,
                                                backgroundColor: '#FFFFFF',
                                                border: '1px solid #CBD5E1',
                                                borderRadius: '10px',
                                                marginTop: '4px',
                                                maxHeight: '210px',
                                                overflowY: 'auto',
                                                zIndex: 30,
                                                boxShadow: '0 12px 24px -4px rgba(15, 23, 42, 0.16)'
                                            }}>
                                                {filteredClients.length > 0 ? (
                                                    filteredClients.map((client, idx) => {
                                                        const parent = client.parent_id ? parentMap.get(client.parent_id) : null;
                                                        const isHighlighted = idx === highlightedClientIndex;
                                                        return (
                                                            <div
                                                                key={client.id}
                                                                onClick={() => {
                                                                    setSelectedClient(client);
                                                                    setShowDropdown(false);
                                                                    setErrorMsg(null);
                                                                    fetchBranchOrders(client.id);
                                                                }}
                                                                onMouseEnter={() => setHighlightedClientIndex(idx)}
                                                                style={{
                                                                    padding: '8px 12px',
                                                                    cursor: 'pointer',
                                                                    borderBottom: '1px solid #F1F5F9',
                                                                    fontSize: '0.79rem',
                                                                    backgroundColor: isHighlighted ? '#F1F5F9' : '#FFFFFF'
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                                                                    <div style={{ fontWeight: 800, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {client.company_name || 'Sin Razón Social'}
                                                                    </div>
                                                                    {parent && (
                                                                        <span style={{ fontSize: '0.6rem', fontWeight: 800, padding: '1px 5px', borderRadius: '4px', backgroundColor: '#ECFDF5', color: '#0D7A57', border: '1px solid #A7F3D0', flexShrink: 0 }}>
                                                                            Sucursal
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div style={{ fontSize: '0.69rem', color: '#64748B', display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '2px' }}>
                                                                    {parent && <span style={{ color: '#0D7A57', fontWeight: 700 }}>Matriz: {parent.company_name}</span>}
                                                                    {client.address && <span>• {client.address}</span>}
                                                                    {client.nit && <span>• NIT: {client.nit}</span>}
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    <div style={{ padding: '12px', fontSize: '0.78rem', color: '#64748B', textAlign: 'center' }}>
                                                        No se encontraron sucursales operativas
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Order Selector when Branch is selected */}
                            {selectedClient && (
                                <div style={{
                                    backgroundColor: '#F8FAFC',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '10px',
                                    padding: '8px 10px'
                                }}>
                                    <label style={{ ...labelStyle, marginBottom: '4px' }}>
                                        Pedido Asociado de la Sede {loadingOrders ? '(Cargando...)' : ''}
                                    </label>
                                    <select
                                        value={selectedOrderId}
                                        onChange={(e) => setSelectedOrderId(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '7px 9px',
                                            borderRadius: '8px',
                                            border: '1px solid #CBD5E1',
                                            fontSize: '0.77rem',
                                            backgroundColor: '#FFFFFF',
                                            color: '#0F172A',
                                            fontWeight: 700,
                                            outline: 'none'
                                        }}
                                    >
                                        <option value="">-- Sin pedido específico / Consulta general --</option>
                                        {branchOrders.map(ord => (
                                            <option key={ord.id} value={ord.id}>
                                                Pedido #{ord.sequence_id} — {ord.delivery_date || new Date(ord.created_at).toLocaleDateString('es-CO')} (${Number(ord.total || 0).toLocaleString('es-CO')})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Categoría Comercial Pills */}
                            <div>
                                <label style={labelStyle}>3. Categoría Comercial</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px' }}>
                                    {[
                                        { id: 'producto', label: 'Producto' },
                                        { id: 'entrega', label: 'Entrega' },
                                        { id: 'facturacion', label: 'Factura' },
                                        { id: 'otro', label: 'Otro' }
                                    ].map(cat => {
                                        const active = category === cat.id;
                                        return (
                                            <button
                                                key={cat.id}
                                                type="button"
                                                onClick={() => setCategory(cat.id as any)}
                                                style={{
                                                    padding: '6px 4px',
                                                    borderRadius: '8px',
                                                    fontSize: '0.72rem',
                                                    fontWeight: active ? 800 : 600,
                                                    backgroundColor: active ? '#0F172A' : '#F8FAFC',
                                                    color: active ? '#FFFFFF' : '#475569',
                                                    border: active ? '1px solid #0F172A' : '1px solid #CBD5E1',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                {cat.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    ) : (
                        /* ================= ÁMBITO INTERNO: PLANTA, PROCESO & RRHH ================= */
                        <>
                            {/* 1. Sub-Ámbito Interno */}
                            <div>
                                <label style={labelStyle}>2. Naturaleza de la Falta o Novedad Interna</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                                    {[
                                        { id: 'rrhh_convivencia', label: 'Convivencia & RRHH', sub: 'Horario / Respeto', icon: Users, color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
                                        { id: 'proceso_planta', label: 'Proceso & Planta', sub: 'Arranque / Salida', icon: Clock, color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD' },
                                        { id: 'equipos_sst', label: 'Equipos & 5S', sub: 'Básculas / Cava', icon: Wrench, color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' }
                                    ].map(item => {
                                        const IconComp = item.icon;
                                        const active = internalSubscope === item.id;
                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => handleSelectSubscope(item.id as InternalSubscope)}
                                                style={{
                                                    padding: '8px 6px',
                                                    borderRadius: '10px',
                                                    backgroundColor: active ? item.bg : '#F8FAFC',
                                                    border: active ? `1.5px solid ${item.color}` : '1px solid #E2E8F0',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    gap: '3px',
                                                    textAlign: 'center',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <IconComp size={15} color={active ? item.color : '#64748B'} />
                                                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: active ? '#0F172A' : '#475569', lineHeight: 1.15 }}>
                                                    {item.label}
                                                </span>
                                                <span style={{ fontSize: '0.6rem', color: '#64748B', fontWeight: 600 }}>
                                                    {item.sub}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 2. Quick Preset Chips (1-Click) */}
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                                    <label style={{ ...labelStyle, marginBottom: 0 }}>Motivos Frecuentes (1 Clic)</label>
                                    <span style={{ fontSize: '0.62rem', color: '#64748B', fontWeight: 600 }}>Autocompleta RCA</span>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                    {activePresets.map(preset => {
                                        const isSelected = selectedPresetId === preset.id;
                                        return (
                                            <button
                                                key={preset.id}
                                                type="button"
                                                onClick={() => handleApplyPreset(preset)}
                                                style={{
                                                    padding: '5px 9px',
                                                    borderRadius: '999px',
                                                    fontSize: '0.71rem',
                                                    fontWeight: isSelected ? 800 : 600,
                                                    backgroundColor: isSelected ? '#0F172A' : '#F1F5F9',
                                                    color: isSelected ? '#FFFFFF' : '#334155',
                                                    border: isSelected ? '1px solid #0F172A' : '1px solid #CBD5E1',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <Sparkles size={11} color={isSelected ? '#38BDF8' : '#64748B'} />
                                                <span>{preset.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 3. Área Operativa + Colaborador Involucrado (2 Columns) */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <div>
                                    <label style={labelStyle}>Área / Proceso *</label>
                                    <select
                                        value={internalArea}
                                        onChange={(e) => setInternalArea(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '7px 8px',
                                            borderRadius: '8px',
                                            border: '1px solid #CBD5E1',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            color: '#0F172A',
                                            backgroundColor: '#F8FAFC',
                                            outline: 'none'
                                        }}
                                    >
                                        {INTERNAL_AREAS.map(area => (
                                            <option key={area} value={area}>{area}</option>
                                        ))}
                                    </select>
                                </div>

                                <div ref={involvedCollabRef} style={{ position: 'relative' }}>
                                    <label style={labelStyle}>Persona Involucrada</label>
                                    {involvedCollaborator ? (
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '6px 8px',
                                            borderRadius: '8px',
                                            backgroundColor: '#F0F9FF',
                                            border: '1px solid #7DD3FC',
                                            fontSize: '0.74rem',
                                            fontWeight: 700,
                                            color: '#0C4A6E'
                                        }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {involvedCollaborator.contact_name}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setInvolvedCollaborator(null);
                                                    setInvolvedCollabQuery('');
                                                }}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    color: '#0284C7',
                                                    display: 'flex',
                                                    padding: 0
                                                }}
                                            >
                                                <X size={13} />
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <input
                                                type="text"
                                                placeholder="Opcional (o proceso gral)..."
                                                value={involvedCollabQuery}
                                                onChange={(e) => {
                                                    setInvolvedCollabQuery(e.target.value);
                                                    setShowInvolvedCollabDropdown(true);
                                                }}
                                                onFocus={() => setShowInvolvedCollabDropdown(true)}
                                                style={{
                                                    width: '100%',
                                                    padding: '7px 8px',
                                                    borderRadius: '8px',
                                                    border: '1px solid #CBD5E1',
                                                    fontSize: '0.75rem',
                                                    color: '#0F172A',
                                                    backgroundColor: '#F8FAFC',
                                                    outline: 'none'
                                                }}
                                            />
                                            {showInvolvedCollabDropdown && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '100%',
                                                    left: 0,
                                                    right: 0,
                                                    backgroundColor: '#FFFFFF',
                                                    border: '1px solid #CBD5E1',
                                                    borderRadius: '8px',
                                                    marginTop: '3px',
                                                    maxHeight: '150px',
                                                    overflowY: 'auto',
                                                    zIndex: 35,
                                                    boxShadow: '0 10px 20px rgba(15, 23, 42, 0.15)'
                                                }}>
                                                    <div
                                                        onClick={() => {
                                                            setInvolvedCollaborator(null);
                                                            setInvolvedCollabQuery('');
                                                            setShowInvolvedCollabDropdown(false);
                                                        }}
                                                        style={{
                                                            padding: '6px 10px',
                                                            fontSize: '0.72rem',
                                                            fontWeight: 700,
                                                            color: '#64748B',
                                                            borderBottom: '1px solid #F1F5F9',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        N/A — Proceso General de Planta
                                                    </div>
                                                    {filteredInvolvedCollabs.map(col => (
                                                        <div
                                                            key={col.id}
                                                            onClick={() => {
                                                                setInvolvedCollaborator(col);
                                                                setShowInvolvedCollabDropdown(false);
                                                            }}
                                                            style={{
                                                                padding: '6px 10px',
                                                                fontSize: '0.74rem',
                                                                color: '#0F172A',
                                                                borderBottom: '1px solid #F8FAFC',
                                                                cursor: 'pointer'
                                                            }}
                                                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F1F5F9')}
                                                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
                                                        >
                                                            <div style={{ fontWeight: 700 }}>{col.contact_name}</div>
                                                            <div style={{ fontSize: '0.65rem', color: '#64748B' }}>{col.role}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {/* D. TIPO & PRIORIDAD (Modern Segmented Pills) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                            <label style={labelStyle}>Tipo de Registro</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                {[
                                    { id: 'reclamo', label: 'Reclamo' },
                                    { id: 'queja', label: 'Queja / Falta' },
                                    { id: 'peticion', label: 'Novedad' },
                                    { id: 'sugerencia', label: 'Kaizen' }
                                ].map(t => {
                                    const active = type === t.id;
                                    return (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => setType(t.id as any)}
                                            style={{
                                                padding: '5px 4px',
                                                borderRadius: '7px',
                                                fontSize: '0.69rem',
                                                fontWeight: active ? 800 : 600,
                                                backgroundColor: active ? '#0F172A' : '#F8FAFC',
                                                color: active ? '#FFFFFF' : '#475569',
                                                border: active ? '1px solid #0F172A' : '1px solid #CBD5E1',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {t.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <label style={labelStyle}>Nivel de Prioridad</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                {[
                                    { id: 'low', label: 'Baja', dot: '#64748B' },
                                    { id: 'normal', label: 'Normal', dot: '#0284C7' },
                                    { id: 'high', label: 'Alta', dot: '#D97706' },
                                    { id: 'urgent', label: 'Urgente', dot: '#DC2626' }
                                ].map(p => {
                                    const active = priority === p.id;
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => setPriority(p.id as any)}
                                            style={{
                                                padding: '5px 6px',
                                                borderRadius: '7px',
                                                fontSize: '0.69rem',
                                                fontWeight: active ? 800 : 600,
                                                backgroundColor: active ? '#0F172A' : '#F8FAFC',
                                                color: active ? '#FFFFFF' : '#475569',
                                                border: active ? '1px solid #0F172A' : '1px solid #CBD5E1',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '5px'
                                            }}
                                        >
                                            <span style={{
                                                width: '6px',
                                                height: '6px',
                                                borderRadius: '50%',
                                                backgroundColor: active ? '#34D399' : p.dot
                                            }} />
                                            <span>{p.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* E. ASUNTO & DESCRIPCIÓN */}
                    <div>
                        <label style={labelStyle}>Asunto / Resumen Ejecutivo *</label>
                        <input
                            type="text"
                            required
                            placeholder={
                                scopeMode === 'client'
                                    ? 'Ej: Fresa golpeada en entrega o faltante de 2 Kg...'
                                    : 'Ej: Llegada tarde a turno / Lanzamiento tardío de operación...'
                            }
                            value={subject}
                            onChange={(e) => {
                                setSubject(e.target.value);
                                setErrorMsg(null);
                            }}
                            style={{
                                width: '100%',
                                padding: '8px 11px',
                                borderRadius: '9px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                color: '#0F172A',
                                backgroundColor: '#F8FAFC',
                                outline: 'none'
                            }}
                        />
                    </div>

                    <div>
                        <label style={labelStyle}>Descripción Detallada de los Hechos *</label>
                        <textarea
                            required
                            rows={2}
                            placeholder={
                                scopeMode === 'client'
                                    ? 'Describe el producto afectado, cantidad y observación del cliente...'
                                    : 'Describe qué ocurrió, hora del suceso y cómo impactó el turno o la salida...'
                            }
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px 11px',
                                borderRadius: '9px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.79rem',
                                color: '#0F172A',
                                backgroundColor: '#F8FAFC',
                                resize: 'vertical',
                                fontFamily: 'inherit',
                                outline: 'none'
                            }}
                        />
                    </div>

                    {/* F. COMPACT EVIDENCE DROPZONE */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        padding: '8px 12px',
                        backgroundColor: '#F8FAFC',
                        border: '1px dashed #CBD5E1',
                        borderRadius: '10px',
                        position: 'relative'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            {previewUrl ? (
                                <img
                                    src={previewUrl}
                                    alt="Preview"
                                    style={{ width: '34px', height: '34px', borderRadius: '7px', objectFit: 'cover', border: '1px solid #CBD5E1', flexShrink: 0 }}
                                />
                            ) : (
                                <div style={{
                                    width: '34px',
                                    height: '34px',
                                    borderRadius: '8px',
                                    backgroundColor: '#FFFFFF',
                                    border: '1px solid #E2E8F0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    <UploadCloud size={16} color="#64748B" />
                                </div>
                            )}
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {files && files.length > 0 ? `${files.length} evidencia(s) adjunta(s)` : 'Evidencia Fotográfica (Opcional)'}
                                </div>
                                <div style={{ fontSize: '0.65rem', color: '#64748B' }}>
                                    {files && files.length > 0 ? 'Clic para reemplazar fotos' : 'Foto de producto, minuta, reloj o equipo'}
                                </div>
                            </div>
                        </div>

                        {files && files.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setFiles(null)}
                                style={{
                                    zIndex: 5,
                                    background: '#FEE2E2',
                                    border: '1px solid #FCA5A5',
                                    color: '#991B1B',
                                    borderRadius: '6px',
                                    padding: '3px 7px',
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                Quitar
                            </button>
                        )}

                        <input
                            type="file"
                            multiple
                            accept="image/*"
                            onChange={(e) => setFiles(e.target.files)}
                            style={{
                                position: 'absolute',
                                inset: 0,
                                opacity: 0,
                                cursor: 'pointer'
                            }}
                        />
                    </div>

                    {/* ERROR BANNER (Zero-Alert Dogma) */}
                    {errorMsg && (
                        <div style={{
                            padding: '8px 11px',
                            borderRadius: '8px',
                            backgroundColor: '#FEF2F2',
                            border: '1px solid #FECACA',
                            color: '#991B1B',
                            fontSize: '0.74rem',
                            fontWeight: 700
                        }}>
                            {errorMsg}
                        </div>
                    )}

                    {/* G. SUBMIT BUTTON */}
                    <button
                        type="submit"
                        disabled={loading || (scopeMode === 'client' && !selectedClient)}
                        style={{
                            padding: '11px 16px',
                            backgroundColor: (loading || (scopeMode === 'client' && !selectedClient)) ? '#94A3B8' : '#0F172A',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '10px',
                            fontWeight: 800,
                            fontSize: '0.82rem',
                            cursor: (loading || (scopeMode === 'client' && !selectedClient)) ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            boxShadow: (loading || (scopeMode === 'client' && !selectedClient)) ? 'none' : '0 4px 12px rgba(15, 23, 42, 0.2)',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} color="#34D399" />}
                        <span>
                            {loading
                                ? 'Radicando en Consola...'
                                : scopeMode === 'client'
                                    ? 'Radicar PQR Comercial'
                                    : 'Registrar Novedad Interna de Planta'}
                        </span>
                    </button>
                </form>
            )}

            <style jsx>{`
                @keyframes slideUp {
                    from { transform: translateY(16px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
}
