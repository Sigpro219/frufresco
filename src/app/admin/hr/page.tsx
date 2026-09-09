'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    User, Users, Briefcase, FileText, Calendar, Plus, Search, Filter, Mail, Phone, 
    MapPin, Building2, Clock, CheckCircle2, AlertCircle, Trash2, Edit2, X, ChevronRight, 
    FileSpreadsheet, LayoutGrid, List, Truck, Eye, EyeOff, HelpCircle, Archive, FolderOpen,
    QrCode, Printer, RefreshCw, Shield, Save, Check, AlertTriangle, Sparkles
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import { THEME, formatNumber } from '@/lib/adminTheme';

const styles = {
    th: {
        padding: '0.7rem 1rem',
        textAlign: 'left' as const,
        fontSize: '0.65rem',
        color: '#475569',
        fontWeight: '700',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em'
    },
    td: {
        padding: '0.7rem 1rem',
        fontSize: '0.82rem',
        borderBottom: '1px solid #F1F5F9',
        verticalAlign: 'middle' as const,
        color: '#1E293B'
    },
    input: {
        width: '100%',
        padding: '0.55rem 0.85rem',
        borderRadius: '8px',
        border: '1px solid #CBD5E1',
        fontSize: '0.82rem',
        fontWeight: '500',
        boxSizing: 'border-box' as const,
        outline: 'none',
        color: '#1A231E'
    }
};

interface Profile {
    id: string;
    contact_name: string;
    email?: string;
    phone?: string;
    contact_phone?: string;
    role: string;
    specialty?: string;
    is_active: boolean;
    is_temporary?: boolean;
    created_at?: string;
    document_id?: string;
    avatar_url?: string;
    qr_token?: string;
    login_requested?: boolean;
}

interface Role {
    value: string;
    label: string;
    color: string;
    bgColor: string;
}

const ROLES: Role[] = [
    { value: 'LIDER DE CARTERA', label: 'Líder de Cartera', color: '#1D4ED8', bgColor: '#EFF6FF' },
    { value: 'AUX DE RUTA', label: 'Auxiliar de Ruta', color: '#B45309', bgColor: '#FEF3C7' },
    { value: 'COORDINADOR ADMINISTRATIVO', label: 'Coordinador Administrativo', color: '#1D4ED8', bgColor: '#EFF6FF' },
    { value: 'LIDER DE LISTA', label: 'Líder de Lista', color: '#0D7A57', bgColor: '#EDF5F1' },
    { value: 'AUX CONTABLE', label: 'Auxiliar Contable', color: '#1D4ED8', bgColor: '#EFF6FF' },
    { value: 'AUX DE BODEGA', label: 'Auxiliar de Bodega', color: '#475569', bgColor: '#F1F5F9' },
    { value: 'LIDER DE FACTURACION', label: 'Líder de Facturación', color: '#1D4ED8', bgColor: '#EFF6FF' },
    { value: 'SERVICIOS GENERALES', label: 'Servicios Generales', color: '#64748B', bgColor: '#F1F5F9' },
    { value: 'LIDER DE INVENTARIO', label: 'Líder de Inventario', color: '#0D7A57', bgColor: '#EDF5F1' },
    { value: 'CONDUCTOR', label: 'Conductor / Piloto', color: '#B45309', bgColor: '#FEF3C7' },
    { value: 'TESORERO', label: 'Tesorero', color: '#1D4ED8', bgColor: '#EFF6FF' },
    { value: 'ENFERMERO', label: 'Enfermero', color: '#991B1B', bgColor: '#FEE2E2' },
    { value: 'AUX ADMINISTRATIVO', label: 'Auxiliar Administrativo', color: '#6D28D9', bgColor: '#F3E8FF' },
    { value: 'COMPRADOR', label: 'Comprador Especialista', color: '#475569', bgColor: '#F1F5F9' },
    { value: 'GESTION DE PEDIDOS', label: 'Gestión de Pedidos', color: '#0D7A57', bgColor: '#EDF5F1' },
    { value: 'COORDINADOR DE OPERACIONES', label: 'Coordinador de Operaciones', color: '#0D7A57', bgColor: '#EDF5F1' },
    { value: 'SERVICIO AL CLIENTE', label: 'Servicio al Cliente', color: '#DB2777', bgColor: '#FCE7F3' },
    { value: 'RR-HH', label: 'Talento Humano (RR-HH)', color: '#6D28D9', bgColor: '#F3E8FF' }
];

const SPECIALTIES = [
    'ADMINISTRACION',
    'BODEGA',
    'LOGISTICA',
    'COMERCIAL',
    'TESORERIA',
    'CARTERA',
    'Sede Administrativa',
    'Sede Operativa',
    'Ruta Bogotá',
    'Externo'
];

export default function HRManagement() {
    const [users, setUsers] = useState<Profile[]>([]);
    const [profiles, setProfiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showSearchHelp, setShowSearchHelp] = useState(false);
    const [filterRole, setFilterRole] = useState('all');
    const [filterSpecialty, setFilterSpecialty] = useState('all');
    const [sortBy, setSortBy] = useState<'name' | 'role' | 'specialty'>('name');
    const [editingUser, setEditingUser] = useState<Profile | null>(null);
    const [showAdd, setShowAdd] = useState(false);
    const [showArchived, setShowArchived] = useState(false);
    const [viewMode, setViewMode] = useState<'gallery' | 'list'>('list');
    const [newUser, setNewUser] = useState<Partial<Profile>>({
        contact_name: '',
        email: '',
        phone: '',
        role: '',
        specialty: '',
        is_active: true,
        login_requested: false
    });
    const [saving, setSaving] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [printingUser, setPrintingUser] = useState<Profile | null>(null);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 120);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const { data: collabData, error: collabError } = await supabase
                .from('collaborators')
                .select('*')
                .order('contact_name', { ascending: true });

            if (collabError) {
                console.warn('Advertencia al consultar tabla colaboradores:', collabError);
            }

            const { data: profilesData } = await supabase
                .from('profiles')
                .select('*');

            if (profilesData) {
                setProfiles(profilesData);
            }

            let allUsers: Profile[] = collabData || [];

            // Si hay perfiles registrados en profiles con rol de staff (no clientes), combinarlos para garantizar visibilidad
            if (profilesData && profilesData.length > 0) {
                const existingEmails = new Set(allUsers.map(u => (u.email || '').toLowerCase()).filter(Boolean));
                const existingIds = new Set(allUsers.map(u => u.id));

                const staffProfiles: Profile[] = profilesData
                    .filter(p => p.role && p.role !== 'b2b_client' && p.role !== 'b2c_client')
                    .filter(p => !existingIds.has(p.id) && !existingEmails.has((p.email || '').toLowerCase()))
                    .map(p => ({
                        id: p.id,
                        contact_name: p.contact_name || p.company_name || p.email || 'Sin Nombre',
                        email: p.email,
                        phone: p.phone || p.contact_phone,
                        contact_phone: p.contact_phone || p.phone,
                        role: p.role,
                        specialty: p.specialty || 'Sede Administrativa',
                        is_active: p.is_active !== false,
                        is_temporary: false,
                        document_id: p.id_zr || p.document_id || '',
                        avatar_url: p.avatar_url
                    }));

                allUsers = [...allUsers, ...staffProfiles];
            }

            setUsers(allUsers);
        } catch (err) {
            console.error('Error fetching HR data:', err);
        } finally {
            setLoading(false);
        }
    };

    const updateProfile = async (userId: string, updates: Partial<Profile>) => {
        try {
            setSaving(true);
            const { id, created_at, ...cleanedUpdates } = updates;
            
            const { error } = await supabase
                .from('collaborators')
                .update(cleanedUpdates)
                .eq('id', userId);

            if (error) throw error;
            setEditingUser(null);
            await fetchData();
            alert('Perfil actualizado con éxito');
        } catch (err: any) {
            alert(`Error al actualizar: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleRegenerateQrToken = async (user: Profile) => {
        if (!confirm(`¿Estás seguro de que deseas regenerar el código QR de ${user.contact_name}? El código anterior quedará desactivado de inmediato.`)) return;
        try {
            setSaving(true);
            const newToken = crypto.randomUUID();
            const { error } = await supabase
                .from('collaborators')
                .update({ qr_token: newToken })
                .eq('id', user.id);
            if (error) throw error;
            
            await supabase.from('audit_logs').insert([{
                action: 'REGENERATE_QR',
                module: 'HR',
                collaborator_id: user.id,
                collaborator_name: user.contact_name,
                details: { token: newToken }
            }]);

            setPrintingUser({ ...user, qr_token: newToken });
            await fetchData();
            alert('Código QR regenerado con éxito');
        } catch (err: any) {
            alert(`Error al regenerar QR: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const registerUser = async () => {
        if (!newUser.contact_name) return alert('El nombre es obligatorio');
        if (!newUser.role) return alert('Debes seleccionar un cargo');
        if (!newUser.specialty) return alert('Debes seleccionar una ubicación/sede');
        try {
            setSaving(true);

            // Check if document_id is already registered
            if (newUser.document_id) {
                const { data: existing, error: checkError } = await supabase
                    .from('collaborators')
                    .select('*')
                    .eq('document_id', newUser.document_id)
                    .maybeSingle();

                if (checkError) throw checkError;

                if (existing) {
                    if (existing.is_active) {
                        alert(`Ya existe un colaborador ACTIVO llamado "${existing.contact_name}" con este documento de identidad.`);
                        setSaving(false);
                        return;
                    } else {
                        const confirmReactivate = confirm(
                            `Ya existe un colaborador llamado "${existing.contact_name}" con este documento de identidad, pero actualmente está INACTIVO/ARCHIVADO.\n\n¿Deseas reactivar su perfil y actualizarlo con los datos ingresados?`
                        );
                        if (!confirmReactivate) {
                            setSaving(false);
                            return;
                        }

                        const { error: updateError } = await supabase
                            .from('collaborators')
                            .update({
                                contact_name: newUser.contact_name,
                                email: newUser.email,
                                phone: newUser.phone,
                                role: newUser.role,
                                specialty: newUser.specialty,
                                is_temporary: newUser.is_temporary || false,
                                login_requested: newUser.login_requested || false,
                                is_active: true
                            })
                            .eq('id', existing.id);

                        if (updateError) throw updateError;

                        setShowAdd(false);
                        setNewUser({ contact_name: '', email: '', phone: '', role: '', specialty: '', is_active: true, is_temporary: false, login_requested: false });
                        await fetchData();
                        alert('Colaborador reactivado y actualizado con éxito.');
                        setSaving(false);
                        return;
                    }
                }
            }

            const { error } = await supabase
                .from('collaborators')
                .insert([{
                    ...newUser,
                    id: crypto.randomUUID(),
                    is_active: true
                }]);

            if (error) throw error;
            setShowAdd(false);
            setNewUser({ contact_name: '', email: '', phone: '', role: '', specialty: '', is_active: true, is_temporary: false, login_requested: false });
            await fetchData();
        } catch (err: any) {
            alert(`Error al registrar: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
        try {
            const { error } = await supabase
                .from('collaborators')
                .update({ is_active: !currentStatus })
                .eq('id', userId);
            if (error) throw error;
            await fetchData();
        } catch (err: any) {
            console.error(err.message);
            alert('Error al cambiar estado.');
        }
    };

    const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();


    const filteredUsers = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        
        return users.filter(u => {
            let matchesSearch = true;
            
            if (query) {
                if (query.startsWith('#')) {
                    matchesSearch = (u.document_id || '').toLowerCase().includes(query.substring(1));
                } else if (query.startsWith('@')) {
                    const metaQuery = normalize(query.substring(1));
                    const roleLabel = normalize(ROLES.find(r => r.value === u.role)?.label || '');
                    const isTempMatch = 'temporal'.includes(metaQuery) && !!u.is_temporary;
                    const isInactiveMatch = ('inactivo'.includes(metaQuery) || 'archivado'.includes(metaQuery)) && u.is_active === false;
                    matchesSearch = roleLabel.includes(metaQuery) || normalize(u.specialty || '').includes(metaQuery) || isTempMatch || isInactiveMatch;
                } else {
                    const terms = query.split(',').map(t => normalize(t.trim())).filter(Boolean);
                    const haystack = normalize([
                        u.contact_name || '', 
                        u.document_id || '', 
                        u.phone || '', 
                        u.contact_phone || '', 
                        u.email || '', 
                        u.role || '', 
                        u.specialty || ''
                    ].join(' '));
                    matchesSearch = terms.some(term => haystack.includes(term));
                }
            }

            const matchesRole = filterRole === 'all' || u.role === filterRole;
            const matchesSpecialty = filterSpecialty === 'all' || u.specialty === filterSpecialty;
            const matchesArchived = showArchived || u.is_active !== false;

            return matchesSearch && matchesRole && matchesSpecialty && matchesArchived;
        }).sort((a, b) => {
            if (sortBy === 'name') return (a.contact_name || '').localeCompare(b.contact_name || '');
            if (sortBy === 'role') return (a.role || '').localeCompare(b.role || '');
            if (sortBy === 'specialty') return (a.specialty || '').localeCompare(b.specialty || '');
            return 0;
        });
    }, [users, searchTerm, filterRole, filterSpecialty, showArchived, sortBy]);

    const dynamicSpecialties = Array.from(new Set(users.map(u => u.specialty).filter(Boolean)))
        .sort((a, b) => (a || '').localeCompare(b || ''));

    const getAvatarStyle = (name: string) => {
        const parts = (name || '').split(' ').filter(Boolean);
        let initials = '?';
        
        if (parts.length >= 3) {
            // Caso: APELLIDO1 APELLIDO2 NOMBRE1... -> Usamos APELLIDO1 y NOMBRE1
            initials = (parts[0][0] + parts[2][0]).toUpperCase();
        } else if (parts.length === 2) {
            // Caso: APELLIDO NOMBRE -> Usamos ambos
            initials = (parts[0][0] + parts[1][0]).toUpperCase();
        } else if (parts.length === 1) {
            initials = parts[0][0].toUpperCase();
        }

        // Color based on name hash
        let hash = 0;
        const full = name || 'unknown';
        for (let i = 0; i < full.length; i++) {
            hash = full.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = Math.abs(hash) % 360;
        return {
            initials,
            bg: `hsla(${h}, 70%, 94%, 1)`,
            color: `hsla(${h}, 80%, 30%, 1)`,
            border: `1.5px solid hsla(${h}, 80%, 40%, 0.3)`
        };
    };

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F8FAF9', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            <div style={{ maxWidth: '100%', padding: '0.85rem 1.75rem', margin: '0 auto' }}>
                
                {/* ========================================================
                    CABECERA EJECUTIVA INDUSTRIAL COMPACTA
                ======================================================== */}
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginBottom: '0.85rem', 
                    gap: '1rem', 
                    flexWrap: 'wrap' 
                }}>
                    <div>
                        <h1 style={{ 
                            fontSize: '1.45rem', 
                            fontWeight: '800', 
                            color: '#1A231E', 
                            letterSpacing: '-0.025em', 
                            margin: 0,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.55rem'
                        }}>
                            <Users size={22} strokeWidth={2.2} style={{ color: '#0D7A57' }} />
                            <span>Talento Humano & Operaciones</span>
                        </h1>
                        <p style={{ color: '#64748B', fontSize: '0.82rem', marginTop: '0.2rem', marginBottom: 0, fontWeight: '500' }}>
                            Administración de colaboradores, credenciales digitales, cargos y gobernanza operativa.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                        <button 
                            onClick={() => setShowAdd(true)}
                            style={{ 
                                padding: '0.55rem 1.15rem', 
                                borderRadius: '10px', 
                                backgroundColor: '#0D7A57', 
                                color: '#FFFFFF', 
                                border: 'none', 
                                fontWeight: '700', 
                                fontSize: '0.82rem',
                                cursor: 'pointer', 
                                boxShadow: '0 2px 4px rgba(13, 122, 87, 0.2)',
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '0.45rem', 
                                transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.backgroundColor = '#0A6245';
                                e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.backgroundColor = '#0D7A57';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                        >
                            <Plus size={15} strokeWidth={2.4} />
                            <span>Registrar Colaborador</span>
                        </button>
                    </div>
                </div>


                {/* ========================================================
                    KPI METRICS CARDS (5 TARJETAS COMPACTAS)
                ======================================================== */}
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', 
                    gap: '0.75rem', 
                    marginBottom: '0.85rem' 
                }}>
                    {[
                        { label: 'Total Equipo', value: users.length, subtitle: 'Plantilla global', icon: <Users size={18} strokeWidth={2} style={{ color: '#1A231E' }} />, bgIcon: '#F1F5F9', color: '#1A231E' },
                        { label: 'Activos en Planta', value: users.filter(u => u.is_active !== false).length, subtitle: 'En operación regular', icon: <CheckCircle2 size={18} strokeWidth={2} style={{ color: '#0D7A57' }} />, bgIcon: '#EDF5F1', color: '#0D7A57' },
                        { label: 'Con Acceso Digital', value: users.filter(u => profiles.some(p => p.collaborator_id === u.id || p.id === u.id || (p.email && u.email && p.email.trim().toLowerCase() === u.email.trim().toLowerCase())) || u.login_requested === true).length, subtitle: 'Credenciales habilitadas', icon: <User size={18} strokeWidth={2} style={{ color: '#1D4ED8' }} />, bgIcon: '#EFF6FF', color: '#1D4ED8' },
                        { label: 'Personal Temporal', value: users.filter(u => u.is_temporary).length, subtitle: 'Refuerzo operativo', icon: <Clock size={18} strokeWidth={2} style={{ color: '#B45309' }} />, bgIcon: '#FEF3C7', color: '#B45309' },
                        { label: 'Conductores / Flota', value: users.filter(u => u.role === 'CONDUCTOR').length, subtitle: 'Distribución y ruta', icon: <Truck size={18} strokeWidth={2} style={{ color: '#0891B2' }} />, bgIcon: '#ECFEFF', color: '#0E7490' }
                    ].map((stat, i) => (
                        <div key={i} 
                            style={{ 
                                backgroundColor: '#FFFFFF', 
                                padding: '0.85rem 1rem', 
                                borderRadius: '12px', 
                                border: '1px solid #E2E8F0',
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.85rem', 
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.borderColor = '#CBD5E1';
                                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.06)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.borderColor = '#E2E8F0';
                                e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';
                            }}
                        >
                            <div style={{ 
                                backgroundColor: stat.bgIcon, 
                                width: '38px', 
                                height: '38px', 
                                borderRadius: '10px', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                flexShrink: 0 
                            }}>
                                {stat.icon}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {stat.label}
                                </div>
                                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: stat.color, lineHeight: '1.2', fontVariantNumeric: 'tabular-nums' }}>
                                    {formatNumber(stat.value)}
                                </div>
                                <div style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: '500', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {stat.subtitle}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ========================================================
                    NIVEL 2: BARRA FLOTANTE STICKY DE CONTROLES & FILTROS
                ======================================================== */}
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginBottom: '0.85rem', 
                    backgroundColor: 'rgba(255, 255, 255, 0.96)', 
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    padding: '0.65rem 1.1rem', 
                    borderRadius: '16px', 
                    border: '1px solid #E2E8F0', 
                    gap: '0.85rem', 
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)', 
                    position: 'sticky', 
                    top: '75px', 
                    zIndex: 50,
                    transition: 'all 0.2s ease-in-out',
                    flexWrap: 'wrap'
                }}>
                    {/* Buscador omnicanal inteligente */}
                    <div style={{ position: 'relative', flex: 1, minWidth: '260px', maxWidth: '460px' }}>
                        <div style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                            <Search size={15} strokeWidth={2} />
                        </div>
                        <input 
                            type="text"
                            placeholder="Buscar por nombre, cédula (#), cargo (@rol) o sede..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ 
                                width: '100%', 
                                padding: '0.55rem 5.8rem 0.55rem 2.4rem', 
                                borderRadius: '10px', 
                                border: '1px solid #CBD5E1', 
                                fontSize: '0.82rem',
                                fontWeight: '500', 
                                backgroundColor: '#F8FAF9', 
                                color: '#1A231E', 
                                outline: 'none',
                                boxSizing: 'border-box',
                                transition: 'all 0.15s ease'
                            }}
                            onFocus={e => {
                                e.currentTarget.style.borderColor = '#0D7A57';
                                e.currentTarget.style.backgroundColor = '#FFFFFF';
                                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(13, 122, 87, 0.12)';
                            }}
                            onBlur={e => {
                                e.currentTarget.style.borderColor = '#CBD5E1';
                                e.currentTarget.style.backgroundColor = '#F8FAF9';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        />

                        {/* Badge de conteo integrado dentro del input */}
                        {(searchTerm || filterRole !== 'all' || filterSpecialty !== 'all' || showArchived) && (
                            <div style={{ 
                                position: 'absolute', 
                                right: searchTerm ? '3.8rem' : '1.8rem', 
                                top: '50%', 
                                transform: 'translateY(-50%)',
                                pointerEvents: 'none',
                                display: 'flex',
                                alignItems: 'center'
                            }}>
                                <span style={{ 
                                    fontSize: '0.68rem', 
                                    fontWeight: '800', 
                                    backgroundColor: '#ECFDF5', 
                                    color: '#065F46', 
                                    padding: '2px 6px', 
                                    borderRadius: '6px',
                                    border: '1px solid #A7F3D0',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {filteredUsers.length} {filteredUsers.length === 1 ? 'resultado' : 'resultados'}
                                </span>
                            </div>
                        )}

                        {searchTerm && (
                            <button 
                                type="button"
                                onClick={() => setSearchTerm('')}
                                style={{ 
                                    position: 'absolute', 
                                    right: '2rem', 
                                    top: '50%', 
                                    transform: 'translateY(-50%)', 
                                    background: '#E2E8F0', 
                                    border: 'none', 
                                    borderRadius: '50%', 
                                    width: '18px', 
                                    height: '18px', 
                                    cursor: 'pointer', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    color: '#64748B',
                                    padding: 0
                                }}
                                title="Limpiar búsqueda"
                            >
                                <X size={12} strokeWidth={2.5} />
                            </button>
                        )}

                        <button 
                            type="button"
                            onClick={() => setShowSearchHelp(!showSearchHelp)}
                            style={{ 
                                position: 'absolute', 
                                right: '0.55rem', 
                                top: '50%', 
                                transform: 'translateY(-50%)', 
                                background: 'none', 
                                border: 'none', 
                                cursor: 'pointer', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                color: showSearchHelp ? '#0D7A57' : '#94A3B8',
                                padding: '4px',
                                borderRadius: '6px',
                                transition: 'all 0.15s ease'
                            }}
                            title="Guía de atajos de búsqueda"
                        >
                            <Sparkles size={15} strokeWidth={2} />
                        </button>

                        {/* Dropdown de atajos */}
                        {showSearchHelp && (
                            <div style={{ 
                                position: 'absolute', 
                                top: '115%', 
                                left: 0, 
                                width: '320px', 
                                backgroundColor: '#FFFFFF', 
                                padding: '1rem', 
                                borderRadius: '12px', 
                                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.12)',
                                zIndex: 100, 
                                border: '1px solid #E2E8F0', 
                                fontSize: '0.78rem'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                                    <div style={{ fontWeight: '800', color: '#1A231E', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                                        <Sparkles size={14} style={{ color: '#0D7A57' }} /> Atajos de Búsqueda
                                    </div>
                                    <button 
                                        onClick={() => setShowSearchHelp(false)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: '0.72rem', fontWeight: '700' }}
                                    >
                                        Cerrar
                                    </button>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                    <div style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <code style={{ backgroundColor: '#ECFDF5', padding: '1px 5px', borderRadius: '4px', fontWeight: '700', color: '#0D7A57' }}>#cedula</code>
                                        <span>Busca por número de cédula exacto</span>
                                    </div>
                                    <div style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <code style={{ backgroundColor: '#ECFDF5', padding: '1px 5px', borderRadius: '4px', fontWeight: '700', color: '#0D7A57' }}>@cargo</code>
                                        <span>Filtra por rol o cargo operativo</span>
                                    </div>
                                    <div style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <code style={{ backgroundColor: '#ECFDF5', padding: '1px 5px', borderRadius: '4px', fontWeight: '700', color: '#0D7A57' }}>@temporal</code>
                                        <span>Muestra personal temporal</span>
                                    </div>
                                    <div style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <code style={{ backgroundColor: '#ECFDF5', padding: '1px 5px', borderRadius: '4px', fontWeight: '700', color: '#0D7A57' }}>,</code>
                                        <span>Separa múltiples términos de búsqueda</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Filtros Dropdown */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <select 
                            value={filterRole} 
                            onChange={e => setFilterRole(e.target.value)} 
                            style={{ 
                                padding: '0.45rem 0.75rem', 
                                borderRadius: '8px', 
                                border: '1px solid #CBD5E1', 
                                backgroundColor: '#FFFFFF',
                                color: '#1A231E',
                                fontWeight: '600', 
                                fontSize: '0.78rem',
                                cursor: 'pointer', 
                                outline: 'none',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                            }}
                        >
                            <option value="all">Todos los Roles</option>
                            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>

                        <select 
                            value={filterSpecialty} 
                            onChange={e => setFilterSpecialty(e.target.value)} 
                            style={{ 
                                padding: '0.45rem 0.75rem', 
                                borderRadius: '8px', 
                                border: '1px solid #CBD5E1', 
                                backgroundColor: '#FFFFFF',
                                color: '#1A231E',
                                fontWeight: '600', 
                                fontSize: '0.78rem',
                                cursor: 'pointer', 
                                outline: 'none',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                            }}
                        >
                            <option value="all">Todas las Sedes</option>
                            {dynamicSpecialties.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>

                        <button 
                            type="button"
                            onClick={() => setShowArchived(!showArchived)}
                            style={{ 
                                padding: '0.45rem 0.75rem', 
                                borderRadius: '8px', 
                                border: `1px solid ${showArchived ? '#FCA5A5' : '#E2E8F0'}`, 
                                backgroundColor: showArchived ? '#FEF2F2' : '#FFFFFF', 
                                color: showArchived ? '#B91C1C' : '#64748B', 
                                fontWeight: '700', 
                                fontSize: '0.78rem',
                                cursor: 'pointer', 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '0.4rem', 
                                transition: 'all 0.15s ease'
                            }}
                            title={showArchived ? 'Ocultar colaboradores archivados' : 'Mostrar colaboradores archivados'}
                        >
                            {showArchived ? <EyeOff size={13} strokeWidth={2.2} /> : <Archive size={13} strokeWidth={2.2} />}
                            <span>{showArchived ? 'Ocultar Archivados' : 'Archivados'}</span>
                        </button>

                        {/* Segmented View Toggle: Lista / Galería */}
                        <div style={{ 
                            display: 'flex', 
                            backgroundColor: '#F1F5F9', 
                            padding: '3px', 
                            borderRadius: '8px', 
                            border: '1px solid #E2E8F0' 
                        }}>
                            <button 
                                type="button"
                                onClick={() => setViewMode('list')}
                                style={{ 
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '0.35rem 0.65rem', 
                                    borderRadius: '6px', 
                                    border: 'none', 
                                    backgroundColor: viewMode === 'list' ? '#FFFFFF' : 'transparent',
                                    color: viewMode === 'list' ? '#0D7A57' : '#64748B',
                                    fontWeight: viewMode === 'list' ? '800' : '600', 
                                    fontSize: '0.75rem',
                                    cursor: 'pointer', 
                                    boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <List size={13} strokeWidth={2.2} />
                                <span>Lista</span>
                            </button>
                            <button 
                                type="button"
                                onClick={() => setViewMode('gallery')}
                                style={{ 
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '0.35rem 0.65rem', 
                                    borderRadius: '6px', 
                                    border: 'none', 
                                    backgroundColor: viewMode === 'gallery' ? '#FFFFFF' : 'transparent',
                                    color: viewMode === 'gallery' ? '#0D7A57' : '#64748B',
                                    fontWeight: viewMode === 'gallery' ? '800' : '600', 
                                    fontSize: '0.75rem',
                                    cursor: 'pointer', 
                                    boxShadow: viewMode === 'gallery' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <LayoutGrid size={13} strokeWidth={2.2} />
                                <span>Galería</span>
                            </button>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                        {[...Array(6)].map((_, i) => (
                            <div key={i} style={{ height: '180px', backgroundColor: '#FFFFFF', borderRadius: '16px', animation: 'pulse 1.5s infinite', border: '1px solid #E2E8F0' }}></div>
                        ))}
                    </div>
                ) : viewMode === 'gallery' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '1rem' }}>
                        {filteredUsers.map(user => {
                            const roleInfo = ROLES.find(r => r.value === user.role) || { label: user.role, color: '#64748B', bgColor: '#F1F5F9' };
                            const avatar = getAvatarStyle(user.contact_name || '');
                            const hasAuthAccess = profiles.some(p => 
                                p.collaborator_id === user.id || 
                                p.id === user.id || 
                                (p.email && user.email && p.email.trim().toLowerCase() === user.email.trim().toLowerCase())
                            ) || user.login_requested === true;

                            return (
                                <div key={user.id} style={{ 
                                    backgroundColor: '#FFFFFF', 
                                    borderRadius: '16px', 
                                    padding: '1.25rem', 
                                    border: '1px solid #E2E8F0',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)', 
                                    display: 'flex', 
                                    flexDirection: 'column',
                                    opacity: user.is_active === false ? 0.65 : 1, 
                                    transition: 'all 0.15s ease',
                                    position: 'relative'
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 8px 16px -4px rgba(0,0,0,0.08)';
                                    e.currentTarget.style.borderColor = '#CBD5E1';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';
                                    e.currentTarget.style.borderColor = '#E2E8F0';
                                }}
                                >
                                    {/* Badges superiores */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                                        {hasAuthAccess ? (
                                            <span style={{ 
                                                padding: '0.15rem 0.5rem', 
                                                borderRadius: '6px', 
                                                fontSize: '0.62rem', 
                                                fontWeight: '800',
                                                backgroundColor: '#EDF5F1', 
                                                color: '#0D7A57', 
                                                border: '1px solid #C8DDD3',
                                                display: 'inline-flex', 
                                                alignItems: 'center', 
                                                gap: '3px'
                                            }}>
                                                <CheckCircle2 size={10} strokeWidth={2.5} color="#0D7A57" /> CON ACCESO
                                            </span>
                                        ) : (
                                            <span style={{ 
                                                padding: '0.15rem 0.5rem', 
                                                borderRadius: '6px', 
                                                fontSize: '0.62rem', 
                                                fontWeight: '700',
                                                backgroundColor: '#F1F5F9', 
                                                color: '#64748B', 
                                                border: '1px solid #E2E8F0'
                                            }}>
                                                SIN ACCESO
                                            </span>
                                        )}

                                        <span style={{ 
                                            padding: '0.15rem 0.5rem', 
                                            borderRadius: '6px', 
                                            fontSize: '0.62rem', 
                                            fontWeight: '800',
                                            backgroundColor: user.is_active === false ? '#FEE2E2' : '#EDF5F1',
                                            color: user.is_active === false ? '#B91C1C' : '#0D7A57',
                                            border: `1px solid ${user.is_active === false ? '#FECACA' : '#C8DDD3'}`
                                        }}>
                                            {user.is_active === false ? 'ARCHIVADO' : 'ACTIVO'}
                                        </span>
                                    </div>

                                    {/* Avatar y Nombre */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.85rem' }}>
                                        <div style={{ 
                                            width: '42px', 
                                            height: '42px', 
                                            borderRadius: '12px', 
                                            backgroundColor: avatar.bg, 
                                            color: avatar.color, 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center', 
                                            fontWeight: '800', 
                                            fontSize: '0.88rem', 
                                            flexShrink: 0, 
                                            border: avatar.border
                                        }}>
                                            {avatar.initials}
                                        </div>
                                        <div style={{ overflow: 'hidden', flex: 1 }}>
                                            <h3 style={{ margin: 0, fontWeight: '700', color: '#1A231E', fontSize: '0.92rem', lineHeight: '1.2', letterSpacing: '-0.01em', wordBreak: 'break-word' }}>
                                                {user.contact_name}
                                            </h3>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                                                <span style={{ 
                                                    fontSize: '0.62rem', 
                                                    fontWeight: '800', 
                                                    color: roleInfo.color, 
                                                    backgroundColor: roleInfo.bgColor, 
                                                    padding: '1px 6px', 
                                                    borderRadius: '4px', 
                                                    textTransform: 'uppercase'
                                                }}>
                                                    {roleInfo.label}
                                                </span>
                                                <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', backgroundColor: '#F1F5F9', color: '#475569', padding: '1px 5px', borderRadius: '4px', fontWeight: '700' }}>
                                                    #{user.document_id || '---'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Ficha rápida de contacto */}
                                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr', gap: '0.35rem', padding: '0.65rem', backgroundColor: '#F8FAF9', borderRadius: '10px', border: '1px solid #E2E8F0', marginBottom: '0.85rem' }}>
                                        {user.is_temporary && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <Clock size={12} style={{ color: '#EF4444' }} />
                                                <span style={{ fontSize: '0.62rem', fontWeight: '800', backgroundColor: '#FEE2E2', color: '#B91C1C', padding: '1px 5px', borderRadius: '4px' }}>
                                                    PERSONAL TEMPORAL
                                                </span>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                            <Phone size={12} style={{ color: '#64748B' }} />
                                            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#1A231E' }}>
                                                {user.phone || user.contact_phone || '---'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                            <Mail size={12} style={{ color: '#94A3B8' }} />
                                            <span style={{ fontSize: '0.72rem', fontWeight: '500', color: '#64748B', wordBreak: 'break-all' }}>
                                                {user.email || 'Sin correo'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                            <MapPin size={12} style={{ color: '#0D7A57' }} />
                                            <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#0D7A57', textTransform: 'uppercase' }}>
                                                {user.specialty || 'Sede FruFresco'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Botones de acción */}
                                    <div style={{ display: 'flex', gap: '0.45rem' }}>
                                        <button 
                                            onClick={() => setEditingUser(user)}
                                            style={{ 
                                                flex: 1, 
                                                padding: '0.45rem', 
                                                borderRadius: '8px', 
                                                border: '1px solid #CBD5E1', 
                                                backgroundColor: '#FFFFFF', 
                                                color: '#334155', 
                                                fontWeight: '700', 
                                                cursor: 'pointer', 
                                                transition: 'all 0.15s ease', 
                                                fontSize: '0.72rem',
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center', 
                                                gap: '0.35rem'
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#F8FAFC'; e.currentTarget.style.borderColor = '#94A3B8'; }}
                                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#FFFFFF'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
                                        >
                                            <Edit2 size={12} strokeWidth={2} /> Editar
                                        </button>
                                        <button 
                                            onClick={() => setPrintingUser(user)} 
                                            style={{ 
                                                padding: '0.45rem 0.65rem', 
                                                borderRadius: '8px', 
                                                border: '1px solid #CBD5E1', 
                                                backgroundColor: '#FFFFFF', 
                                                color: '#334155', 
                                                fontWeight: '700', 
                                                cursor: 'pointer', 
                                                transition: 'all 0.15s ease', 
                                                fontSize: '0.72rem',
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center'
                                            }} 
                                            title="Imprimir Carnet / Código QR"
                                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#F8FAFC'; e.currentTarget.style.borderColor = '#94A3B8'; }}
                                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#FFFFFF'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
                                        >
                                            <QrCode size={13} strokeWidth={2} />
                                        </button>
                                        <button 
                                            onClick={() => toggleUserStatus(user.id, user.is_active !== false)}
                                            style={{ 
                                                padding: '0.45rem 0.75rem', 
                                                borderRadius: '8px', 
                                                border: `1px solid ${user.is_active === false ? '#A7F3D0' : '#FECACA'}`, 
                                                backgroundColor: user.is_active === false ? '#ECFDF5' : '#FEF2F2', 
                                                color: user.is_active === false ? '#065F46' : '#B91C1C', 
                                                fontWeight: '700', 
                                                cursor: 'pointer', 
                                                transition: 'all 0.15s ease', 
                                                fontSize: '0.72rem',
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center', 
                                                gap: '0.35rem'
                                            }}
                                            title={user.is_active === false ? 'Reactivar Colaborador' : 'Archivar Colaborador'}
                                        >
                                            {user.is_active === false ? (
                                                <>
                                                    <FolderOpen size={12} strokeWidth={2} /> Reactivar
                                                </>
                                            ) : (
                                                <>
                                                    <EyeOff size={12} strokeWidth={2} /> Archivar
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* ========================================================
                       VISTA LISTA / TABLA INDUSTRIAL
                    ======================================================== */
                    <div style={{ 
                        backgroundColor: '#FFFFFF', 
                        borderRadius: '16px', 
                        border: '1px solid #E2E8F0', 
                        overflow: 'hidden', 
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)' 
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                <tr>
                                    <th style={styles.th}>Colaborador</th>
                                    <th style={styles.th}>Rol & Sede</th>
                                    <th style={styles.th}>Contacto</th>
                                    <th style={{ ...styles.th, textAlign: 'right' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
                                            No se encontraron colaboradores que coincidan con los filtros aplicados.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredUsers.map(user => {
                                        const roleInfo = ROLES.find(r => r.value === user.role) || { label: user.role, color: '#64748B', bgColor: '#F1F5F9' };
                                        const avatar = getAvatarStyle(user.contact_name || '');
                                        const hasAuthAccess = profiles.some(p => 
                                            p.collaborator_id === user.id || 
                                            p.id === user.id || 
                                            (p.email && user.email && p.email.trim().toLowerCase() === user.email.trim().toLowerCase())
                                        ) || user.login_requested === true;

                                        return (
                                            <tr key={user.id} className="collaborator-row" style={{ borderBottom: '1px solid #F1F5F9', opacity: user.is_active === false ? 0.65 : 1 }}>
                                                {/* Colaborador: Avatar + Nombre + Cédula + Acceso */}
                                                <td style={styles.td}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                        <div style={{ 
                                                            width: '36px', 
                                                            height: '36px', 
                                                            borderRadius: '10px', 
                                                            backgroundColor: avatar.bg, 
                                                            color: avatar.color, 
                                                            display: 'flex', 
                                                            alignItems: 'center', 
                                                            justifyContent: 'center', 
                                                            fontWeight: '800', 
                                                            fontSize: '0.82rem', 
                                                            border: avatar.border,
                                                            flexShrink: 0
                                                        }}>
                                                            {avatar.initials}
                                                        </div>
                                                        <div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                                                                <span style={{ fontWeight: '700', color: '#1A231E', fontSize: '0.85rem' }}>
                                                                    {user.contact_name}
                                                                </span>
                                                                {hasAuthAccess ? (
                                                                    <span 
                                                                        title="Acceso Digital Autenticado Activo"
                                                                        style={{ 
                                                                            display: 'inline-flex', 
                                                                            alignItems: 'center', 
                                                                            gap: '3px', 
                                                                            backgroundColor: '#EDF5F1', 
                                                                            color: '#0D7A57', 
                                                                            padding: '1px 6px', 
                                                                            borderRadius: '6px', 
                                                                            fontSize: '0.62rem', 
                                                                            fontWeight: '800',
                                                                            border: '1px solid #C8DDD3'
                                                                        }}
                                                                    >
                                                                        <CheckCircle2 size={10} strokeWidth={2.5} color="#0D7A57" /> Con Acceso
                                                                    </span>
                                                                ) : (
                                                                    <span 
                                                                        title="Sin credenciales creadas"
                                                                        style={{ 
                                                                            display: 'inline-flex', 
                                                                            alignItems: 'center', 
                                                                            gap: '3px', 
                                                                            backgroundColor: '#F1F5F9', 
                                                                            color: '#64748B', 
                                                                            padding: '1px 5px', 
                                                                            borderRadius: '6px', 
                                                                            fontSize: '0.6rem', 
                                                                            fontWeight: '600',
                                                                            border: '1px solid #E2E8F0'
                                                                        }}
                                                                    >
                                                                        Sin Acceso
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '2px' }}>
                                                                <span style={{ fontFamily: 'monospace', backgroundColor: '#F1F5F9', color: '#475569', padding: '1px 5px', borderRadius: '4px', fontWeight: '700' }}>
                                                                    #{user.document_id || '---'}
                                                                </span>
                                                                {user.is_temporary && (
                                                                    <span style={{ fontSize: '0.6rem', fontWeight: '800', backgroundColor: '#FEE2E2', color: '#B91C1C', padding: '1px 5px', borderRadius: '4px' }}>
                                                                        TEMPORAL
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Rol & Sede */}
                                                <td style={styles.td}>
                                                    <span style={{ fontSize: '0.68rem', fontWeight: '800', color: roleInfo.color, backgroundColor: roleInfo.bgColor, padding: '2px 7px', borderRadius: '5px' }}>
                                                        {roleInfo.label.toUpperCase()}
                                                    </span>
                                                    <div style={{ fontSize: '0.72rem', color: '#0D7A57', fontWeight: '700', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                        <MapPin size={11} strokeWidth={2} /> {user.specialty || 'SEDE FRUFRESCO'}
                                                    </div>
                                                </td>

                                                {/* Contacto */}
                                                <td style={styles.td}>
                                                    <div style={{ fontWeight: '700', color: '#1A231E', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Phone size={12} style={{ color: '#64748B' }} />
                                                        <span>{user.phone || user.contact_phone || '---'}</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                                        <Mail size={11} style={{ color: '#94A3B8' }} />
                                                        <span>{user.email || '---'}</span>
                                                    </div>
                                                </td>

                                                {/* Acciones */}
                                                <td style={{ ...styles.td, textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                                                        <button 
                                                            onClick={() => setEditingUser(user)} 
                                                            style={{ 
                                                                background: '#FFFFFF', 
                                                                border: '1px solid #CBD5E1', 
                                                                borderRadius: '8px', 
                                                                cursor: 'pointer', 
                                                                padding: '0.35rem', 
                                                                display: 'inline-flex', 
                                                                alignItems: 'center', 
                                                                justifyContent: 'center',
                                                                color: '#475569', 
                                                                transition: 'all 0.15s ease'
                                                            }} 
                                                            title="Editar Perfil"
                                                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#94A3B8'; e.currentTarget.style.backgroundColor = '#F8FAFC'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.backgroundColor = '#FFFFFF'; }}
                                                        >
                                                            <Edit2 size={13} strokeWidth={2} />
                                                        </button>
                                                        <button 
                                                            onClick={() => setPrintingUser(user)} 
                                                            style={{ 
                                                                background: '#FFFFFF', 
                                                                border: '1px solid #CBD5E1', 
                                                                borderRadius: '8px', 
                                                                cursor: 'pointer', 
                                                                padding: '0.35rem', 
                                                                display: 'inline-flex', 
                                                                alignItems: 'center', 
                                                                justifyContent: 'center',
                                                                color: '#475569', 
                                                                transition: 'all 0.15s ease'
                                                            }} 
                                                            title="Imprimir Carnet / Código QR"
                                                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#94A3B8'; e.currentTarget.style.backgroundColor = '#F8FAFC'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.backgroundColor = '#FFFFFF'; }}
                                                        >
                                                            <QrCode size={13} strokeWidth={2} />
                                                        </button>
                                                        <button 
                                                            onClick={() => toggleUserStatus(user.id, user.is_active !== false)} 
                                                            style={{ 
                                                                background: user.is_active === false ? '#ECFDF5' : '#FEF2F2', 
                                                                border: `1px solid ${user.is_active === false ? '#A7F3D0' : '#FECACA'}`, 
                                                                borderRadius: '8px', 
                                                                cursor: 'pointer', 
                                                                padding: '0.35rem', 
                                                                display: 'inline-flex', 
                                                                alignItems: 'center', 
                                                                justifyContent: 'center',
                                                                color: user.is_active === false ? '#065F46' : '#B91C1C', 
                                                                transition: 'all 0.15s ease'
                                                            }} 
                                                            title={user.is_active === false ? 'Reactivar' : 'Archivar'}
                                                        >
                                                            {user.is_active === false ? <FolderOpen size={13} strokeWidth={2} /> : <EyeOff size={13} strokeWidth={2} />}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* MODAL EDITAR */}
            {editingUser && (
                <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 1000, padding: '1rem' }}>
                    <div style={{ backgroundColor: '#FFFFFF', padding: '1.8rem', borderRadius: '16px', border: '1px solid #E2E8F0', width: '100%', maxWidth: '480px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <div style={{ width: '34px', height: '34px', borderRadius: '8px', backgroundColor: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0D7A57' }}>
                                    <Edit2 size={16} strokeWidth={2.2} />
                                </div>
                                <h2 style={{ margin: 0, fontWeight: '800', color: '#1A231E', fontSize: '1.2rem' }}>
                                    Editar Perfil
                                </h2>
                            </div>
                            <button 
                                onClick={() => setEditingUser(null)} 
                                style={{ 
                                    background: '#F1F5F9', border: 'none', width: '28px', height: '28px', borderRadius: '50%', 
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', transition: 'all 0.15s ease' 
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#E2E8F0'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                            >
                                <X size={15} strokeWidth={2.2} />
                            </button>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: '#64748B', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Nombre Completo</label>
                                <input 
                                    value={editingUser.contact_name} 
                                    onChange={e => setEditingUser({...editingUser, contact_name: e.target.value})}
                                    style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontWeight: '600', color: '#1A231E', outline: 'none', boxSizing: 'border-box', fontSize: '0.82rem' }}
                                />
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: '#64748B', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Teléfono Móvil</label>
                                    <input value={editingUser.phone || editingUser.contact_phone || ''} onChange={e => setEditingUser({...editingUser, phone: e.target.value, contact_phone: e.target.value})} style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontWeight: '600', color: '#1A231E', boxSizing: 'border-box', outline: 'none', fontSize: '0.82rem' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: '#64748B', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cédula / ID</label>
                                    <input value={editingUser.document_id || ''} onChange={e => setEditingUser({...editingUser, document_id: e.target.value})} style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontWeight: '600', color: '#1A231E', boxSizing: 'border-box', outline: 'none', fontSize: '0.82rem' }} />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: '#64748B', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Correo Electrónico</label>
                                <input 
                                    value={editingUser.email || ''} 
                                    onChange={e => setEditingUser({...editingUser, email: e.target.value})}
                                    style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontWeight: '600', color: '#1A231E', outline: 'none', boxSizing: 'border-box', fontSize: '0.82rem' }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: '#64748B', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cargo en la Compañía</label>
                                    <select value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value})} style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontWeight: '700', color: '#1A231E', backgroundColor: '#FFFFFF', outline: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>
                                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: '#64748B', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Especialidad / Sede</label>
                                    <select value={editingUser.specialty || ''} onChange={e => setEditingUser({...editingUser, specialty: e.target.value})} style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontWeight: '700', color: '#1A231E', backgroundColor: '#FFFFFF', outline: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>
                                        <option value="">Seleccionar Ubicación...</option>
                                        {dynamicSpecialties.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>


                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', backgroundColor: '#F8FAF9', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    <input 
                                        type="checkbox" 
                                        id="edit_is_temporary"
                                        checked={editingUser.is_temporary || false} 
                                        onChange={e => setEditingUser({...editingUser, is_temporary: e.target.checked})}
                                        style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#0D7A57' }}
                                    />
                                    <label htmlFor="edit_is_temporary" style={{ fontSize: '0.8rem', fontWeight: '700', color: '#1A231E', cursor: 'pointer' }}>Personal Temporal</label>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', backgroundColor: '#F8FAF9', borderRadius: '8px', border: '1px solid #E2E8F0', opacity: profiles.some(p => p.collaborator_id === editingUser.id) ? 0.7 : 1 }}>
                                    <input 
                                        type="checkbox" 
                                        id="edit_login_requested"
                                        checked={profiles.some(p => p.collaborator_id === editingUser.id) || editingUser.login_requested || false} 
                                        disabled={profiles.some(p => p.collaborator_id === editingUser.id)}
                                        onChange={e => setEditingUser({...editingUser, login_requested: e.target.checked})}
                                        style={{ width: '16px', height: '16px', cursor: profiles.some(p => p.collaborator_id === editingUser.id) ? 'not-allowed' : 'pointer', accentColor: '#0D7A57' }}
                                    />
                                    <label htmlFor="edit_login_requested" style={{ fontSize: '0.8rem', fontWeight: '700', color: '#1A231E', cursor: profiles.some(p => p.collaborator_id === editingUser.id) ? 'not-allowed' : 'pointer' }}>
                                        {profiles.some(p => p.collaborator_id === editingUser.id) ? 'Acceso Activo' : 'Solicitar Acceso'}
                                    </label>
                                </div>
                            </div>

                            <button 
                                onClick={() => updateProfile(editingUser.id, editingUser)} 
                                style={{ 
                                    marginTop: '0.5rem', padding:'0.75rem', borderRadius: '8px', border: 'none', 
                                    backgroundColor: '#0D7A57', color:'white', fontWeight:'800', cursor: 'pointer',
                                    fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem',
                                    transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#0A6245'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0D7A57'}
                            >
                                {saving ? <Clock size={16} className="animate-spin" /> : <FolderOpen size={16} />}
                                <span>{saving ? 'Guardando...' : 'GUARDAR CAMBIOS'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL REGISTRO */}
            {showAdd && (
                <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 1000, padding: '1rem' }}>
                    <div style={{ backgroundColor: '#FFFFFF', padding: '1.8rem', borderRadius: '16px', border: '1px solid #E2E8F0', width: '100%', maxWidth: '480px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <div style={{ width: '34px', height: '34px', borderRadius: '8px', backgroundColor: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0D7A57' }}>
                                    <Plus size={16} strokeWidth={2.4} />
                                </div>
                                <h2 style={{ margin: 0, fontWeight: '800', color: '#1A231E', fontSize: '1.2rem' }}>
                                    Nuevo Colaborador
                                </h2>
                            </div>
                            <button 
                                onClick={() => setShowAdd(false)} 
                                style={{ 
                                    background: '#F1F5F9', border: 'none', width: '28px', height: '28px', borderRadius: '50%', 
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', transition: 'all 0.15s ease' 
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#E2E8F0'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                            >
                                <X size={15} strokeWidth={2.2} />
                            </button>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: '#64748B', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Nombre Completo</label>
                                <input 
                                    placeholder="Ej: Laura Gómez" 
                                    value={newUser.contact_name} 
                                    onChange={e => setNewUser({...newUser, contact_name: e.target.value})}
                                    style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontWeight: '600', color: '#1A231E', boxSizing: 'border-box', outline: 'none', fontSize: '0.82rem' }}
                                />
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: '#64748B', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cédula</label>
                                    <input placeholder="Cédula" value={newUser.document_id || ''} onChange={e => setNewUser({...newUser, document_id: e.target.value})} style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontWeight: '600', color: '#1A231E', boxSizing: 'border-box', outline: 'none', fontSize: '0.82rem' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: '#64748B', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Teléfono</label>
                                    <input placeholder="Teléfono" value={newUser.phone || ''} onChange={e => setNewUser({...newUser, phone: e.target.value})} style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontWeight: '600', color: '#1A231E', boxSizing: 'border-box', outline: 'none', fontSize: '0.82rem' }} />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: '#64748B', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Correo Electrónico</label>
                                <input placeholder="correo@ejemplo.com" value={newUser.email || ''} onChange={e => setNewUser({...newUser, email: e.target.value})} style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontWeight: '600', color: '#1A231E', boxSizing: 'border-box', outline: 'none', fontSize: '0.82rem' }} />
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: '#64748B', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cargo</label>
                                    <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})} style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontWeight: '700', color: '#1A231E', backgroundColor: '#FFFFFF', outline: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>
                                        <option value="" disabled>Seleccionar Cargo...</option>
                                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: '#64748B', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ubicación</label>
                                    <select value={newUser.specialty} onChange={e => setNewUser({...newUser, specialty: e.target.value})} style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontWeight: '700', color: '#1A231E', backgroundColor: '#FFFFFF', outline: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>
                                        <option value="" disabled>Seleccionar Sede...</option>
                                        {dynamicSpecialties.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', backgroundColor: '#F8FAF9', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    <input 
                                        type="checkbox" 
                                        id="is_temporary"
                                        checked={newUser.is_temporary || false} 
                                        onChange={e => setNewUser({...newUser, is_temporary: e.target.checked})}
                                        style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#0D7A57' }}
                                    />
                                    <label htmlFor="is_temporary" style={{ fontSize: '0.8rem', fontWeight: '700', color: '#1A231E', cursor: 'pointer' }}>Personal Temporal</label>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', backgroundColor: '#F8FAF9', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    <input 
                                        type="checkbox" 
                                        id="add_login_requested"
                                        checked={newUser.login_requested || false} 
                                        onChange={e => setNewUser({...newUser, login_requested: e.target.checked})}
                                        style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#0D7A57' }}
                                    />
                                    <label htmlFor="add_login_requested" style={{ fontSize: '0.8rem', fontWeight: '700', color: '#1A231E', cursor: 'pointer' }}>Solicitar Acceso Digital</label>
                                </div>
                            </div>

                            <button 
                                onClick={registerUser} 
                                style={{ 
                                    marginTop: '0.5rem', padding:'0.75rem', borderRadius: '8px', border: 'none', 
                                    backgroundColor: '#0D7A57', color:'white', fontWeight:'800', cursor: 'pointer',
                                    fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem',
                                    transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#0A6245'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0D7A57'}
                            >
                                {saving ? <Clock size={16} className="animate-spin" /> : <Plus size={16} strokeWidth={2.4} />}
                                <span>{saving ? 'Registrando...' : 'COMPLETAR REGISTRO'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* MODAL IMPRIMIR QR */}
            {printingUser && (
                <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 1000 }} className="no-print">
                    <div style={{ backgroundColor: 'white', padding: '1.8rem', borderRadius: '16px', border: `1px solid ${THEME.colors.border}`, width: '100%', maxWidth: '420px', boxShadow: THEME.shadow.lg }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                <QrCode strokeWidth={1.5} size={20} style={{ color: THEME.colors.primary }} />
                                <h2 style={{ margin: 0, fontWeight: '700', color: THEME.colors.textMain, fontSize: '1.2rem' }}>
                                    Etiqueta QR
                                </h2>
                            </div>
                            <button 
                                onClick={() => setPrintingUser(null)} 
                                style={{ 
                                    background: THEME.colors.background, border: 'none', width: '32px', height: '32px', borderRadius: '50%', 
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.colors.textSecondary 
                                }}
                            >
                                <X strokeWidth={1.5} size={18} />
                            </button>
                        </div>

                        {/* Print Content Area */}
                        <div id="print-label-area" style={{ 
                            padding: '1.5rem', border: '2px dashed #E2E8F0', borderRadius: '16px', backgroundColor: '#F8FAF9', 
                            display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0.8rem',
                            marginBottom: '1.5rem'
                        }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: THEME.colors.textMain }}>{printingUser.contact_name}</h3>
                            <span style={{ fontSize: '0.7rem', fontWeight: '900', color: THEME.colors.primary, textTransform: 'uppercase', letterSpacing: '0.05em', backgroundColor: THEME.colors.primaryLight, padding: '2px 8px', borderRadius: '4px' }}>
                                {ROLES.find(r => r.value === printingUser.role)?.label || printingUser.role}
                            </span>
                            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>
                                Doc ID: {printingUser.document_id || '---'}
                            </div>

                            {/* QR Code Graphic */}
                            <div style={{ padding: '1rem', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #E2E8F0', marginTop: '0.5rem' }}>
                                <QRCodeSVG value={printingUser.qr_token || printingUser.id} size={130} level="H" />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.8rem' }}>
                            <button 
                                onClick={() => {
                                    const printWin = window.open('', '_blank', 'width=700,height=700,scrollbars=yes');
                                    if (!printWin) return alert('Por favor, permite las ventanas emergentes (popups) para poder imprimir la etiqueta.');
                                    
                                    const roleLabel = ROLES.find(r => r.value === printingUser.role)?.label || printingUser.role;
                                    const qrSvgHtml = document.querySelector('#print-label-area svg')?.outerHTML || '';

                                    printWin.document.write(`
                                        <html>
                                        <head>
                                            <title>Imprimir QR - ${printingUser.contact_name}</title>
                                            <style>
                                                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;800;900&display=swap');
                                                body {
                                                    margin: 0;
                                                    padding: 0;
                                                    display: flex;
                                                    justify-content: center;
                                                    align-items: center;
                                                    height: 100vh;
                                                    background-color: #f1f5f9;
                                                    font-family: 'Outfit', sans-serif;
                                                }
                                                /* Medida del carnet estándar (ID-1): 85.6mm x 54mm */
                                                .carnet-label {
                                                    width: 85mm;
                                                    height: 53mm;
                                                    border: 1px dashed #94a3b8;
                                                    box-sizing: border-box;
                                                    padding: 5mm 6mm;
                                                    display: flex;
                                                    flex-direction: row;
                                                    align-items: center;
                                                    justify-content: space-between;
                                                    gap: 5mm;
                                                    background-color: #ffffff;
                                                    border-radius: 8px;
                                                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
                                                    transform: scale(1.6); /* Zoom en pantalla */
                                                    transform-origin: center;
                                                }
                                                .info-side {
                                                    display: flex;
                                                    flex-direction: column;
                                                    justify-content: center;
                                                    align-items: flex-start;
                                                    flex: 1;
                                                    text-align: left;
                                                    max-width: 45mm;
                                                }
                                                .title-name {
                                                    font-size: 10.5pt;
                                                    font-weight: 800;
                                                    color: #1a231e;
                                                    margin: 0 0 4px 0;
                                                    line-height: 1.25;
                                                    text-transform: uppercase;
                                                }
                                                .role-badge {
                                                    font-size: 7.5pt;
                                                    font-weight: 900;
                                                    color: #0d7a57;
                                                    background-color: #f0fdf4;
                                                    padding: 3px 8px;
                                                    border-radius: 4px;
                                                    text-transform: uppercase;
                                                    margin-bottom: 6px;
                                                    display: inline-block;
                                                }
                                                .doc-id {
                                                    font-size: 8pt;
                                                    font-weight: 700;
                                                    color: #64748b;
                                                }
                                                .qr-side {
                                                    display: flex;
                                                    justify-content: center;
                                                    align-items: center;
                                                    padding: 6px;
                                                    background-color: white;
                                                    border: 1px solid #e2e8f0;
                                                    border-radius: 8px;
                                                }
                                                .qr-side svg {
                                                    width: 38mm;
                                                    height: 38mm;
                                                }
                                                @media print {
                                                    @page {
                                                        margin: 0;
                                                        size: portrait;
                                                    }
                                                    body {
                                                        margin: 0;
                                                        padding: 2mm; /* Pequeño margen físico en la esquina superior izquierda de la hoja */
                                                        display: block;
                                                        height: auto;
                                                        background-color: white;
                                                    }
                                                    .carnet-label {
                                                        transform: none !important; /* Desactivar zoom al imprimir */
                                                        box-shadow: none !important;
                                                        border: 1px dashed #94a3b8 !important;
                                                        -webkit-print-color-adjust: exact;
                                                        print-color-adjust: exact;
                                                    }
                                                }
                                            </style>
                                        </head>
                                        <body>
                                            <div class="carnet-label">
                                                <div class="info-side">
                                                    <span class="role-badge">${roleLabel}</span>
                                                    <h3 class="title-name">${printingUser.contact_name}</h3>
                                                    <span class="doc-id">Doc: ${printingUser.document_id || '---'}</span>
                                                </div>
                                                <div class="qr-side">
                                                    ${qrSvgHtml}
                                                </div>
                                            </div>
                                            <script>
                                                window.onload = function() {
                                                    setTimeout(function() {
                                                        window.print();
                                                        window.close();
                                                    }, 300);
                                                }
                                            </script>
                                        </body>
                                        </html>
                                    `);
                                    printWin.document.close();
                                }}
                                style={{ 
                                    flex: 1, padding: '0.8rem', borderRadius: '12px', border: 'none', 
                                    backgroundColor: THEME.colors.primary, color: 'white', fontWeight: '800', 
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' 
                                }}
                            >
                                <Printer size={16} /> Imprimir Etiqueta
                            </button>
                            <button 
                                onClick={() => handleRegenerateQrToken(printingUser)}
                                style={{ 
                                    padding: '0.8rem', borderRadius: '12px', border: `1px solid #FCA5A5`, 
                                    backgroundColor: 'transparent', color: '#EF4444', fontWeight: '800', 
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' 
                                }}
                                title="Reportar extravío y generar nuevo QR"
                            >
                                <RefreshCw size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            )}



            <style jsx>{`
                @keyframes pulse {
                    0%, 100% { background-color: #F4F7F6; }
                    50% { background-color: #EAEFEA; }
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .animate-spin {
                    animation: spin 1s linear infinite;
                    display: inline-block;
                }
                tr.collaborator-row {
                    transition: background-color 0.2s ease;
                }
                tr.collaborator-row:hover {
                    background-color: #F8FAF9 !important;
                }
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    #print-label-area, #print-label-area * {
                        visibility: visible;
                    }
                    #print-label-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        border: none !important;
                        background-color: white !important;
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            `}</style>
        </main>
    );
}

