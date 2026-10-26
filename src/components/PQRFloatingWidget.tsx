'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
    MessageSquarePlus, X, Send, CheckCircle2,
    UploadCloud, Loader2, Search, Building2, UserCheck,
    ShieldAlert, Settings, Users, Wrench, Clock,
    AlertTriangle, PackageX, Truck, FileText, Edit3
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


function parseClientBranchInfo(client: ClientProfile, parent?: ClientProfile | null): {
    branchName: string;
    parentName: string | null;
    isBranch: boolean;
} {
    const rawName = (client.company_name || client.contact_name || '').trim();
    const hasParent = Boolean(client.parent_id || parent);
    
    if (parent && parent.company_name) {
        const parentComp = parent.company_name.trim();
        if (rawName.toLowerCase().startsWith(parentComp.toLowerCase())) {
            const stripped = rawName.slice(parentComp.length).replace(/^[\s\-–—:]+/, '').trim();
            if (stripped) {
                return {
                    branchName: stripped,
                    parentName: parentComp,
                    isBranch: true
                };
            }
        }
    }

    const hyphenMatch = rawName.match(/^(.*?)\s*[-–—]\s*(.+)$/);
    if (hyphenMatch) {
        return {
            branchName: hyphenMatch[2].trim(),
            parentName: hyphenMatch[1].trim(),
            isBranch: true
        };
    }

    if (parent && parent.company_name) {
        return {
            branchName: rawName,
            parentName: parent.company_name,
            isBranch: true
        };
    }

    return {
        branchName: rawName || 'Sin Razón Social',
        parentName: null,
        isBranch: hasParent
    };
}

interface QuickChip {
    id: string;
    label: string;
    icon: React.ComponentType<{ size?: number; color?: string }>;
    scope: ScopeMode;
    // Client fields
    category?: 'producto' | 'entrega' | 'facturacion' | 'otro';
    // Internal fields
    subscope?: InternalSubscope;
    categoryL1?: string;
    subtypeL2?: string;
    defaultArea?: string;
    // Shared
    defaultType: 'queja' | 'reclamo' | 'peticion' | 'sugerencia';
    defaultPriority: 'low' | 'normal' | 'high' | 'urgent';
    isCustomCause?: boolean;
}

const QUICK_CHIPS: QuickChip[] = [
    // Ámbito Cliente / Pedido
    {
        id: 'client_calidad',
        label: 'Calidad / Avería',
        icon: AlertTriangle,
        scope: 'client',
        category: 'producto',
        defaultType: 'reclamo',
        defaultPriority: 'high'
    },
    {
        id: 'client_faltante',
        label: 'Faltante en entrega',
        icon: PackageX,
        scope: 'client',
        category: 'entrega',
        defaultType: 'reclamo',
        defaultPriority: 'high'
    },
    {
        id: 'client_ruta',
        label: 'Retraso en ruta',
        icon: Truck,
        scope: 'client',
        category: 'entrega',
        defaultType: 'queja',
        defaultPriority: 'normal'
    },
    {
        id: 'client_factura',
        label: 'Diferencia en factura',
        icon: FileText,
        scope: 'client',
        category: 'facturacion',
        defaultType: 'reclamo',
        defaultPriority: 'normal'
    },
    {
        id: 'client_otra_causa',
        label: 'Otra causa / Hallazgo',
        icon: Edit3,
        scope: 'client',
        category: 'otro',
        defaultType: 'peticion',
        defaultPriority: 'normal',
        isCustomCause: true
    },
    // Ámbito Interno / Planta & RRHH
    {
        id: 'llegada_tarde',
        label: 'Llegada tarde a turno',
        icon: Clock,
        scope: 'internal',
        subscope: 'rrhh_convivencia',
        categoryL1: 'talento_humano_disciplina',
        subtypeL2: 'llegada_tarde_turno',
        defaultArea: 'Picking / Alistamiento',
        defaultType: 'queja',
        defaultPriority: 'normal'
    },
    {
        id: 'falta_respeto',
        label: 'Falta de respeto / Convivencia',
        icon: Users,
        scope: 'internal',
        subscope: 'rrhh_convivencia',
        categoryL1: 'talento_humano_disciplina',
        subtypeL2: 'falta_respeto_convivencia',
        defaultArea: 'Bodega / Recepción',
        defaultType: 'queja',
        defaultPriority: 'high'
    },
    {
        id: 'lanzamiento_tardio',
        label: 'Lanzamiento tardío de operación',
        icon: AlertTriangle,
        scope: 'internal',
        subscope: 'proceso_planta',
        categoryL1: 'proceso_operativo_interno',
        subtypeL2: 'lanzamiento_tardio_operacion',
        defaultArea: 'Comercial / Programación',
        defaultType: 'reclamo',
        defaultPriority: 'high'
    },
    {
        id: 'retraso_salida_flota',
        label: 'Retraso salida de flota',
        icon: Truck,
        scope: 'internal',
        subscope: 'proceso_planta',
        categoryL1: 'proceso_operativo_interno',
        subtypeL2: 'retraso_salida_flota_muelle',
        defaultArea: 'Transporte / Despachos',
        defaultType: 'reclamo',
        defaultPriority: 'high'
    },
    {
        id: 'falla_bascula',
        label: 'Falla de báscula / equipo',
        icon: Wrench,
        scope: 'internal',
        subscope: 'equipos_sst',
        categoryL1: 'proceso_operativo_interno',
        subtypeL2: 'falla_equipos_bascula_sistema',
        defaultArea: 'Picking / Alistamiento',
        defaultType: 'peticion',
        defaultPriority: 'high'
    },
    {
        id: 'incumplimiento_epp',
        label: 'Incumplimiento EPP / 5S',
        icon: ShieldAlert,
        scope: 'internal',
        subscope: 'rrhh_convivencia',
        categoryL1: 'talento_humano_disciplina',
        subtypeL2: 'incumplimiento_epp_bpm',
        defaultArea: 'Bodega / Recepción',
        defaultType: 'queja',
        defaultPriority: 'normal'
    },
    {
        id: 'internal_otra_causa',
        label: 'Otra causa / Hallazgo',
        icon: Edit3,
        scope: 'internal',
        subscope: 'rrhh_convivencia',
        categoryL1: 'talento_humano_disciplina',
        subtypeL2: 'otra_causa_rrhh_abierta',
        defaultArea: 'Bodega / Recepción',
        defaultType: 'queja',
        defaultPriority: 'normal',
        isCustomCause: true
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
    const [isHovered, setIsHovered] = useState(false);
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // 1. Scope Switcher: 'client' vs 'internal'
    const [scopeMode, setScopeMode] = useState<ScopeMode>('client');

    // 2A. Clients & Orders state (for 'client' scope)
    const [clients, setClients] = useState<ClientProfile[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedClient, setSelectedClient] = useState<ClientProfile | null>(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [highlightedClientIndex, setHighlightedClientIndex] = useState(0);
    const [branchOrders, setBranchOrders] = useState<Array<{ id: string; sequence_id: number; total: number; delivery_date?: string; created_at: string; status: string }>>([]);
    const [selectedOrderId, setSelectedOrderId] = useState<string>('');
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [manualOrderSearch, setManualOrderSearch] = useState('');
    const [searchingManualOrder, setSearchingManualOrder] = useState(false);

    // 2B. Internal Scope state (for 'internal' scope)
    const [internalSubscope, setInternalSubscope] = useState<InternalSubscope>('rrhh_convivencia');
    const [internalArea, setInternalArea] = useState<string>('Picking / Alistamiento');
    const [internalCategoryL1, setInternalCategoryL1] = useState<string>('talento_humano_disciplina');
    const [internalSubtypeL2, setInternalSubtypeL2] = useState<string>('llegada_tarde_turno');
    const [involvedCollaborator, setInvolvedCollaborator] = useState<CollaboratorItem | null>(null);
    const [involvedCollabQuery, setInvolvedCollabQuery] = useState('');
    const [showInvolvedCollabDropdown, setShowInvolvedCollabDropdown] = useState(false);

    // 3. Quick Chip & Unified Description state (Raptor 3: 1 single text field)
    const [selectedChipId, setSelectedChipId] = useState<string>('client_calidad');
    const [customCauseText, setCustomCauseText] = useState<string>('');
    const [type, setType] = useState<'queja' | 'reclamo' | 'peticion' | 'sugerencia'>('reclamo');
    const [category, setCategory] = useState<'producto' | 'entrega' | 'facturacion' | 'otro'>('producto');
    const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('high');
    const [description, setDescription] = useState('');
    const [files, setFiles] = useState<FileList | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    // Reporter state
    const [collaborators, setCollaborators] = useState<CollaboratorItem[]>([]);
    const [selectedCollaborator, setSelectedCollaborator] = useState<CollaboratorItem | null>(null);
    const [changingReporter, setChangingReporter] = useState(false);

    const dropdownRef = useRef<HTMLDivElement>(null);
    const involvedCollabRef = useRef<HTMLDivElement>(null);
    const customCauseInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (showDropdown) setShowDropdown(false);
                else if (showInvolvedCollabDropdown) setShowInvolvedCollabDropdown(false);
                else setIsOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, showDropdown, showInvolvedCollabDropdown]);

    useEffect(() => {
        if (isOpen && clients.length === 0) fetchClients();
        if (isOpen && collaborators.length === 0) fetchCollaboratorsAndCurrentUser();
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

    // Poka-Yoke SDD v1.9.253: Filter out pure Parent Matrices so operators only select operational branches
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

    const fetchBranchOrders = async (target: ClientProfile | string, explicitParentId?: string | null) => {
        setLoadingOrders(true);
        try {
            const branchId = typeof target === 'string' ? target : target.id;
            const parentId = typeof target === 'string' ? explicitParentId : target.parent_id;

            const targetProfileIds: string[] = [branchId];
            if (parentId && !targetProfileIds.includes(parentId)) {
                targetProfileIds.push(parentId);
            }
            clients.forEach(c => {
                if ((c.parent_id === branchId || (parentId && c.parent_id === parentId)) && !targetProfileIds.includes(c.id)) {
                    targetProfileIds.push(c.id);
                }
            });

            const { data } = await supabase
                .from('orders')
                .select('id, sequence_id, total, delivery_date, created_at, status')
                .in('profile_id', targetProfileIds)
                .neq('status', 'cancelled')
                .order('created_at', { ascending: false })
                .limit(20);
            const list = data || [];
            setBranchOrders(list);
            setSelectedOrderId(list.length > 0 ? list[0].id : '');
        } catch (err) {
            console.error('Error fetching branch orders for PQR:', err);
            setBranchOrders([]);
        } finally {
            setLoadingOrders(false);
        }
    };

    const handleSearchManualOrder = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const seq = parseInt(manualOrderSearch.replace(/\D/g, ''), 10);
        if (!seq) return;
        setSearchingManualOrder(true);
        setErrorMsg(null);
        try {
            const { data } = await supabase
                .from('orders')
                .select('id, sequence_id, total, delivery_date, created_at, status, profile_id')
                .eq('sequence_id', seq)
                .maybeSingle();

            if (data) {
                setBranchOrders(prev => {
                    const exists = prev.some(o => o.id === data.id);
                    return exists ? prev : [data, ...prev];
                });
                setSelectedOrderId(data.id);
                setManualOrderSearch('');
                if (data.profile_id && (!selectedClient || (selectedClient.id !== data.profile_id && selectedClient.parent_id !== data.profile_id))) {
                    const matchedCl = clients.find(c => c.id === data.profile_id) || null;
                    if (matchedCl) setSelectedClient(matchedCl);
                }
            } else {
                setErrorMsg(`No se encontró ningún pedido con el número #${seq}.`);
            }
        } catch (err: any) {
            console.error('Error buscando pedido manual:', err);
        } finally {
            setSearchingManualOrder(false);
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
                        role: prof?.role || 'Operaciones'
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

    const visibleChips = useMemo(() => {
        return QUICK_CHIPS.filter(c => c.scope === scopeMode);
    }, [scopeMode]);

    const handleSelectChip = (chip: QuickChip) => {
        setSelectedChipId(chip.id);
        setType(chip.defaultType);
        setPriority(chip.defaultPriority);
        if (chip.scope === 'client' && chip.category) {
            setCategory(chip.category);
        }
        if (chip.scope === 'internal') {
            if (chip.subscope) setInternalSubscope(chip.subscope);
            if (chip.categoryL1) setInternalCategoryL1(chip.categoryL1);
            if (chip.subtypeL2) setInternalSubtypeL2(chip.subtypeL2);
            if (chip.defaultArea) setInternalArea(chip.defaultArea);
        }
        setErrorMsg(null);
        if (chip.isCustomCause) {
            setTimeout(() => customCauseInputRef.current?.focus(), 40);
        }
    };

    const handleSwitchScope = (nextScope: ScopeMode) => {
        setScopeMode(nextScope);
        setErrorMsg(null);
        const firstChip = QUICK_CHIPS.find(c => c.scope === nextScope);
        if (firstChip) handleSelectChip(firstChip);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);

        if (scopeMode === 'client' && !selectedClient) {
            setErrorMsg('Selecciona la sucursal o cliente del reporte.');
            return;
        }
        const activeChipObj = QUICK_CHIPS.find(c => c.id === selectedChipId);
        if (activeChipObj?.isCustomCause && !customCauseText.trim()) {
            setErrorMsg('Escribe la causa o el hallazgo específico.');
            customCauseInputRef.current?.focus();
            return;
        }
        if (!description.trim()) {
            setErrorMsg('Describe brevemente qué sucedió.');
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

            const activeChip = QUICK_CHIPS.find(c => c.id === selectedChipId);
            const cleanFirstLine = description.trim().split('\n')[0].trim();
            const shortSnippet = cleanFirstLine.length > 62 ? `${cleanFirstLine.substring(0, 62)}...` : cleanFirstLine;
            const causeLabel = activeChip?.isCustomCause
                ? customCauseText.trim()
                : (activeChip?.label || '');
            const synthesizedSubject = causeLabel
                ? `${causeLabel}: ${shortSnippet}`
                : shortSnippet;

            const reporterHeader = selectedCollaborator
                ? `[Radicado por Colaborador FruFresco: ${selectedCollaborator.contact_name} (${selectedCollaborator.role})]`
                : `[Radicado por Colaborador FruFresco: Mesa Operativa]`;

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
                    subtypeL2: activeChip?.isCustomCause ? customCauseText.trim() : internalSubtypeL2,
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

                const finalSubject = `[INTERNA - ${internalArea}] ${synthesizedSubject}`;
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
                        subject: synthesizedSubject,
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
                setDescription('');
                setCustomCauseText('');
                setFiles(null);
                setSelectedClient(null);
                setSearchQuery('');
                setBranchOrders([]);
                setSelectedOrderId('');
                setInvolvedCollaborator(null);
                setInvolvedCollabQuery('');
            }, 1600);

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
        letterSpacing: '0.04em',
        marginBottom: '5px'
    };

    if (!isOpen) {
        return (
            <div
                style={{
                    position: 'fixed',
                    top: '52%',
                    right: 0,
                    transform: 'translateY(-50%)',
                    zIndex: 40,
                    display: 'flex',
                    alignItems: 'center',
                    fontFamily: 'var(--font-inter), sans-serif'
                }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                {/* Tooltip flotante hacia la izquierda en hover */}
                {isHovered && (
                    <div style={{
                        position: 'absolute',
                        right: '30px',
                        backgroundColor: '#0F172A',
                        color: '#FFFFFF',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                        border: '1px solid #334155',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        pointerEvents: 'none'
                    }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#FFFFFF' }}>
                            Radicar PQR / Novedad
                        </span>
                        <span style={{ fontSize: '0.62rem', color: '#34D399', fontWeight: 600 }}>
                            Clientes • Planta • RRHH (Clic para abrir)
                        </span>
                    </div>
                )}

                {/* Tirador Vertical Ultra-Delgado */}
                <button
                    type="button"
                    onClick={() => setIsOpen(true)}
                    style={{
                        width: '24px',
                        minHeight: '88px',
                        backgroundColor: isHovered ? '#064E3B' : '#0F172A',
                        color: '#FFFFFF',
                        borderTopLeftRadius: '8px',
                        borderBottomLeftRadius: '8px',
                        borderTopRightRadius: 0,
                        borderBottomRightRadius: 0,
                        border: '1px solid #1E293B',
                        borderRight: 'none',
                        padding: '8px 2px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        boxShadow: isHovered 
                            ? '-4px 8px 20px rgba(13, 122, 87, 0.4)' 
                            : '-2px 4px 10px rgba(15, 23, 42, 0.3)',
                        cursor: 'pointer',
                        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                        transform: isHovered ? 'translateX(-3px)' : 'translateX(0)',
                        outline: 'none'
                    }}
                    title="Radicar PQR Comercial o Novedad Interna de Planta"
                >
                    {/* Pulsing Beacon Dot */}
                    <span style={{
                        display: 'flex',
                        position: 'relative',
                        height: '7px',
                        width: '7px',
                        marginTop: '2px'
                    }}>
                        <span className="animate-ping" style={{
                            position: 'absolute',
                            display: 'inline-flex',
                            height: '100%',
                            width: '100%',
                            borderRadius: '50%',
                            backgroundColor: '#34D399',
                            opacity: 0.75
                        }} />
                        <span style={{
                            position: 'relative',
                            display: 'inline-flex',
                            borderRadius: '50%',
                            height: '7px',
                            width: '7px',
                            backgroundColor: '#10B981',
                            boxShadow: '0 0 6px #10B981'
                        }} />
                    </span>

                    {/* Icon */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '4px 0'
                    }}>
                        <MessageSquarePlus size={13} color={isHovered ? '#34D399' : '#CBD5E1'} />
                    </div>

                    {/* Vertical Letters: P - Q - R */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        fontSize: '0.62rem',
                        fontWeight: 900,
                        letterSpacing: '0.04em',
                        color: isHovered ? '#FFFFFF' : '#94A3B8',
                        lineHeight: 1.05,
                        marginBottom: '2px'
                    }}>
                        <span>P</span>
                        <span>Q</span>
                        <span>R</span>
                    </div>
                </button>
            </div>
        );
    }

    return (
        <div style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '540px',
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
            animation: 'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
            {/* 1. OBSIDIAN HEADER + INTEGRATED REPORTER LINE */}
            <div style={{
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                padding: '13px 16px 11px 16px',
                borderBottom: '1px solid #1E293B',
                flexShrink: 0
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '9px',
                            backgroundColor: scopeMode === 'client' ? 'rgba(16, 185, 129, 0.16)' : 'rgba(56, 189, 248, 0.16)',
                            border: scopeMode === 'client' ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(56, 189, 248, 0.35)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}>
                            {scopeMode === 'client' ? (
                                <ShieldAlert size={17} color="#34D399" />
                            ) : (
                                <Settings size={17} color="#38BDF8" />
                            )}
                        </div>
                        <div>
                            <h3 style={{
                                margin: 0,
                                fontSize: '0.94rem',
                                fontWeight: 800,
                                letterSpacing: '-0.01em',
                                fontFamily: 'var(--font-outfit), sans-serif',
                                color: '#FFFFFF'
                            }}>
                                Radicar PQR / Novedad
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', fontSize: '0.69rem', color: '#94A3B8' }}>
                                <UserCheck size={12} color="#34D399" />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }}>
                                    Radica: <strong style={{ color: '#E2E8F0' }}>{selectedCollaborator?.contact_name || 'Mesa Operativa'}</strong>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setChangingReporter(!changingReporter)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#38BDF8',
                                        fontSize: '0.67rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        padding: 0,
                                        textDecoration: 'underline'
                                    }}
                                >
                                    {changingReporter ? 'Cerrar' : 'Cambiar'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsOpen(false)}
                        style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(255, 255, 255, 0.06)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: '#CBD5E1',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                        title="Cerrar (Esc)"
                    >
                        <X size={15} />
                    </button>
                </div>

                {changingReporter && (
                    <div style={{ marginTop: '8px' }}>
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
                                border: '1px solid #334155',
                                fontSize: '0.75rem',
                                backgroundColor: '#1E293B',
                                color: '#FFFFFF',
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
                    </div>
                )}
            </div>

            {/* 2. BODY CONTENT (Raptor 3: 4 Clean Steps, Zero Bloat) */}
            {submitted ? (
                <div style={{ padding: '40px 24px', textAlign: 'center', backgroundColor: '#FFFFFF' }}>
                    <div style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '14px',
                        backgroundColor: '#ECFDF5',
                        border: '1px solid #A7F3D0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 12px auto'
                    }}>
                        <CheckCircle2 size={28} color="#0D7A57" />
                    </div>
                    <h4 style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0', fontFamily: 'var(--font-outfit), sans-serif' }}>
                        {scopeMode === 'client' ? 'PQR Comercial Radicada' : 'Novedad Interna Registrada'}
                    </h4>
                    <p style={{ fontSize: '0.8rem', color: '#64748B', margin: 0, lineHeight: 1.45 }}>
                        Disponible de inmediato en la consola de Gestión de Calidad.
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
                    {/* STEP 1: DUAL-SCOPE SWITCHER */}
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
                            onClick={() => handleSwitchScope('client')}
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
                            onClick={() => handleSwitchScope('internal')}
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

                    {/* STEP 2: TARGET (BRANCH + ORDER vs AREA + PERSON) */}
                    {scopeMode === 'client' ? (
                        <>
                            <div ref={dropdownRef} style={{ position: 'relative' }}>
                                <label style={labelStyle}>Sucursal / Cliente *</label>

                                {selectedClient ? (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        justifyContent: 'space-between',
                                        gap: '10px',
                                        padding: '9px 12px',
                                        backgroundColor: '#F0FDF4',
                                        border: '1px solid #86EFAC',
                                        borderRadius: '11px',
                                        fontSize: '0.8rem',
                                        color: '#065F46'
                                    }}>
                                        {(() => {
                                            const parent = selectedClient.parent_id ? parentMap.get(selectedClient.parent_id) : null;
                                            const info = parseClientBranchInfo(selectedClient, parent);
                                            return (
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', minWidth: 0, flex: 1 }}>
                                                    <div style={{
                                                        width: '32px',
                                                        height: '32px',
                                                        borderRadius: '8px',
                                                        backgroundColor: '#DCFCE7',
                                                        border: '1px solid #86EFAC',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        flexShrink: 0,
                                                        marginTop: '2px'
                                                    }}>
                                                        <Building2 size={17} color="#0D7A57" />
                                                    </div>
                                                    <div style={{ minWidth: 0, flex: 1 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '2px' }}>
                                                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#064E3B', lineHeight: 1.25, wordBreak: 'break-word' }}>
                                                                {info.branchName}
                                                            </span>
                                                            {info.isBranch && (
                                                                <span style={{ fontSize: '0.62rem', fontWeight: 800, backgroundColor: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC', padding: '1px 6px', borderRadius: '4px', letterSpacing: '0.04em' }}>
                                                                    SUCURSAL
                                                                </span>
                                                            )}
                                                        </div>
                                                        {info.parentName && info.parentName.toLowerCase() !== info.branchName.toLowerCase() && (
                                                            <div style={{ fontSize: '0.72rem', color: '#065F46', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                                                <span style={{ opacity: 0.75 }}>Matriz:</span>
                                                                <strong style={{ color: '#064E3B' }}>{info.parentName}</strong>
                                                            </div>
                                                        )}
                                                        <div style={{ fontSize: '0.68rem', color: '#047857', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                            {selectedClient.address && <span>📍 {selectedClient.address}</span>}
                                                            {selectedClient.nit && <span>• NIT: {selectedClient.nit}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })()}
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
                                                width: '26px',
                                                height: '26px',
                                                cursor: 'pointer',
                                                color: '#047857',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                                marginTop: '2px'
                                            }}
                                            title="Cambiar sucursal"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <div>
                                        <div style={{ position: 'relative' }}>
                                            <Search size={15} style={{ position: 'absolute', left: '11px', top: '10px', color: '#64748B' }} />
                                            <input
                                                type="text"
                                                placeholder="Buscar sucursal, cliente, NIT o dirección..."
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
                                                            fetchBranchOrders(chosen);
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
                                                maxHeight: '260px',
                                                overflowY: 'auto',
                                                zIndex: 30,
                                                boxShadow: '0 12px 24px -4px rgba(15, 23, 42, 0.16)'
                                            }}>
                                                {filteredClients.length > 0 ? (
                                                    filteredClients.map((client, idx) => {
                                                        const parent = client.parent_id ? parentMap.get(client.parent_id) : null;
                                                        const isHighlighted = idx === highlightedClientIndex;
                                                        const info = parseClientBranchInfo(client, parent);
                                                        return (
                                                            <div
                                                                key={client.id}
                                                                onClick={() => {
                                                                    setSelectedClient(client);
                                                                    setShowDropdown(false);
                                                                    setErrorMsg(null);
                                                                    fetchBranchOrders(client);
                                                                }}
                                                                onMouseEnter={() => setHighlightedClientIndex(idx)}
                                                                style={{
                                                                    padding: '9px 12px',
                                                                    cursor: 'pointer',
                                                                    borderBottom: '1px solid #F1F5F9',
                                                                    fontSize: '0.78rem',
                                                                    backgroundColor: isHighlighted ? '#F0FDF4' : '#FFFFFF',
                                                                    transition: 'background-color 0.1s ease'
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                                                                    <div style={{ minWidth: 0, flex: 1 }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                                            <span style={{
                                                                                fontWeight: 800,
                                                                                color: isHighlighted ? '#065F46' : '#0F172A',
                                                                                fontSize: '0.84rem',
                                                                                lineHeight: 1.25,
                                                                                wordBreak: 'break-word'
                                                                            }}>
                                                                                {info.branchName}
                                                                            </span>
                                                                            {info.isBranch && (
                                                                                <span style={{
                                                                                    fontSize: '0.6rem',
                                                                                    fontWeight: 800,
                                                                                    padding: '1px 5px',
                                                                                    borderRadius: '4px',
                                                                                    backgroundColor: '#ECFDF5',
                                                                                    color: '#0D7A57',
                                                                                    border: '1px solid #A7F3D0',
                                                                                    flexShrink: 0
                                                                                }}>
                                                                                    Sucursal
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        {info.parentName && info.parentName.toLowerCase() !== info.branchName.toLowerCase() && (
                                                                            <div style={{ fontSize: '0.71rem', color: '#475569', marginTop: '2px', fontWeight: 500 }}>
                                                                                <span style={{ color: '#0D7A57', fontWeight: 700 }}>Matriz:</span> {info.parentName}
                                                                            </div>
                                                                        )}
                                                                        <div style={{ fontSize: '0.67rem', color: '#64748B', display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '2px' }}>
                                                                            {client.address && <span>📍 {client.address}</span>}
                                                                            {client.nit && <span>• NIT: {client.nit}</span>}
                                                                        </div>
                                                                    </div>
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

                            {selectedClient && (
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                                        <label style={labelStyle}>
                                            Pedido Asociado {loadingOrders ? '(Cargando...)' : ''}
                                        </label>
                                        <span style={{ fontSize: '0.65rem', color: '#64748B' }}>
                                            {branchOrders.length} pedido(s) disponible(s)
                                        </span>
                                    </div>
                                    <select
                                        value={selectedOrderId}
                                        onChange={(e) => setSelectedOrderId(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '7px 10px',
                                            borderRadius: '9px',
                                            border: '1px solid #CBD5E1',
                                            fontSize: '0.78rem',
                                            backgroundColor: '#F8FAFC',
                                            color: '#0F172A',
                                            fontWeight: 700,
                                            outline: 'none'
                                        }}
                                    >
                                        <option value="">-- Sin pedido específico --</option>
                                        {branchOrders.map(ord => (
                                            <option key={ord.id} value={ord.id}>
                                                Pedido #{ord.sequence_id} — {ord.delivery_date || new Date(ord.created_at).toLocaleDateString('es-CO')} (${Number(ord.total || 0).toLocaleString('es-CO')})
                                            </option>
                                        ))}
                                    </select>
                                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', alignItems: 'center' }}>
                                        <input
                                            type="text"
                                            placeholder="¿No lo ves? Digita # pedido (ej: 1202)"
                                            value={manualOrderSearch}
                                            onChange={(e) => setManualOrderSearch(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    handleSearchManualOrder();
                                                }
                                            }}
                                            style={{
                                                flex: 1,
                                                padding: '5px 9px',
                                                borderRadius: '7px',
                                                border: '1px solid #CBD5E1',
                                                fontSize: '0.72rem',
                                                backgroundColor: '#FFFFFF',
                                                outline: 'none'
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handleSearchManualOrder()}
                                            disabled={searchingManualOrder || !manualOrderSearch.trim()}
                                            style={{
                                                padding: '5px 10px',
                                                borderRadius: '7px',
                                                backgroundColor: '#0F172A',
                                                color: '#FFFFFF',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                border: 'none',
                                                cursor: searchingManualOrder || !manualOrderSearch.trim() ? 'not-allowed' : 'pointer',
                                                opacity: searchingManualOrder || !manualOrderSearch.trim() ? 0.6 : 1,
                                                flexShrink: 0
                                            }}
                                        >
                                            {searchingManualOrder ? 'Buscando...' : 'Vincular #'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                                <label style={labelStyle}>Área Operativa *</label>
                                <select
                                    value={internalArea}
                                    onChange={(e) => setInternalArea(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 9px',
                                        borderRadius: '9px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.76rem',
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
                                <label style={labelStyle}>Persona (Opcional)</label>
                                {involvedCollaborator ? (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '7px 9px',
                                        borderRadius: '9px',
                                        backgroundColor: '#F0F9FF',
                                        border: '1px solid #7DD3FC',
                                        fontSize: '0.75rem',
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
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0284C7', display: 'flex', padding: 0 }}
                                        >
                                            <X size={13} />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <input
                                            type="text"
                                            placeholder="Proceso general o buscar..."
                                            value={involvedCollabQuery}
                                            onChange={(e) => {
                                                setInvolvedCollabQuery(e.target.value);
                                                setShowInvolvedCollabDropdown(true);
                                            }}
                                            onFocus={() => setShowInvolvedCollabDropdown(true)}
                                            style={{
                                                width: '100%',
                                                padding: '8px 9px',
                                                borderRadius: '9px',
                                                border: '1px solid #CBD5E1',
                                                fontSize: '0.76rem',
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
                                                borderRadius: '9px',
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
                                                        padding: '7px 10px',
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
                    )}

                    {/* STEP 3: UNIFIED MOTIVE CHIPS + SINGLE DESCRIPTION FIELD */}
                    <div>
                        <label style={labelStyle}>¿Qué sucedió? *</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
                            {visibleChips.map(chip => {
                                const IconComp = chip.icon;
                                const active = selectedChipId === chip.id;
                                return (
                                    <button
                                        key={chip.id}
                                        type="button"
                                        onClick={() => handleSelectChip(chip)}
                                        style={{
                                            padding: '5px 9px',
                                            borderRadius: '8px',
                                            fontSize: '0.71rem',
                                            fontWeight: active ? 800 : 600,
                                            backgroundColor: active ? '#0F172A' : '#F8FAFC',
                                            color: active ? '#FFFFFF' : '#334155',
                                            border: active ? '1px solid #0F172A' : '1px solid #CBD5E1',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <IconComp size={12} color={active ? '#34D399' : '#64748B'} />
                                        <span>{chip.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {QUICK_CHIPS.find(c => c.id === selectedChipId)?.isCustomCause && (
                            <div style={{ marginBottom: '8px' }}>
                                <input
                                    ref={customCauseInputRef}
                                    type="text"
                                    placeholder={
                                        scopeMode === 'internal'
                                            ? 'Escribe la causa o hallazgo específico (ej. Error en planilla, llaves, descuido)...'
                                            : 'Escribe la causa o motivo específico del reporte...'
                                    }
                                    value={customCauseText}
                                    onChange={(e) => {
                                        setCustomCauseText(e.target.value);
                                        setErrorMsg(null);
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '8px 11px',
                                        borderRadius: '9px',
                                        border: '1.5px solid #0284C7',
                                        fontSize: '0.79rem',
                                        fontWeight: 700,
                                        color: '#0F172A',
                                        backgroundColor: '#F0F9FF',
                                        outline: 'none'
                                    }}
                                />
                            </div>
                        )}

                        <textarea
                            required
                            rows={3}
                            placeholder={
                                scopeMode === 'client'
                                    ? 'Ej: Llegaron 2 Kg de fresa golpeada o faltó 1 caja de aguacate...'
                                    : 'Ej: Se lanzó la operación a las 5:40 AM retrasando la salida de rutas...'
                            }
                            value={description}
                            onChange={(e) => {
                                setDescription(e.target.value);
                                setErrorMsg(null);
                            }}
                            style={{
                                width: '100%',
                                padding: '9px 11px',
                                borderRadius: '10px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.8rem',
                                color: '#0F172A',
                                backgroundColor: '#F8FAFC',
                                resize: 'vertical',
                                fontFamily: 'inherit',
                                lineHeight: 1.45,
                                outline: 'none'
                            }}
                        />
                    </div>

                    {/* STEP 4: COMPACT EVIDENCE DROPZONE + SUBMIT */}
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
                                    style={{ width: '32px', height: '32px', borderRadius: '7px', objectFit: 'cover', border: '1px solid #CBD5E1', flexShrink: 0 }}
                                />
                            ) : (
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    backgroundColor: '#FFFFFF',
                                    border: '1px solid #E2E8F0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    <UploadCloud size={15} color="#64748B" />
                                </div>
                            )}
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {files && files.length > 0 ? `${files.length} foto(s) adjunta(s)` : 'Adjuntar Foto (Opcional)'}
                                </div>
                                <div style={{ fontSize: '0.64rem', color: '#64748B' }}>
                                    {files && files.length > 0 ? 'Clic para cambiar' : 'Evidencia de producto, turno o equipo'}
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
                                ? 'Radicando...'
                                : scopeMode === 'client'
                                    ? 'Radicar PQR Comercial'
                                    : 'Registrar Novedad Interna'}
                        </span>
                    </button>
                </form>
            )}

            <style jsx>{`
                @keyframes slideUp {
                    from { transform: translateY(14px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
}
