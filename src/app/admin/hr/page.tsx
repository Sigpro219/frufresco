'use client';

import React, { useState, useEffect } from 'react';
import { 
    User, Users, Briefcase, FileText, Calendar, Plus, Search, Filter, Mail, Phone, 
    MapPin, Building2, Clock, CheckCircle2, AlertCircle, Trash2, Edit2, X, ChevronRight, 
    FileSpreadsheet, LayoutGrid, List, Truck, Eye, EyeOff, HelpCircle, Archive, FolderOpen 
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { THEME, formatNumber } from '@/lib/adminTheme';

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
}

interface Role {
    value: string;
    label: string;
    color: string;
    bgColor: string;
}

const ROLES: Role[] = [
    { value: 'LIDER DE CARTERA', label: 'Líder de Cartera', color: '#1E3A8A', bgColor: '#DBEAFE' },
    { value: 'AUX DE RUTA', label: 'Auxiliar de Ruta', color: '#B45309', bgColor: '#FEF3C7' },
    { value: 'COORDINADOR ADMINISTRATIVO', label: 'Coordinador Administrativo', color: '#1E40AF', bgColor: '#DBEAFE' },
    { value: 'LIDER DE LISTA', label: 'Líder de Lista', color: '#059669', bgColor: '#D1FAE5' },
    { value: 'AUX CONTABLE', label: 'Auxiliar Contable', color: '#2563EB', bgColor: '#EFF6FF' },
    { value: 'AUX DE BODEGA', label: 'Auxiliar de Bodega', color: '#4B5563', bgColor: '#F3F4F6' },
    { value: 'LIDER DE FACTURACION', label: 'Líder de Facturación', color: '#2563EB', bgColor: '#DBEAFE' },
    { value: 'SERVICIOS GENERALES', label: 'Servicios Generales', color: '#6B7280', bgColor: '#F3F4F6' },
    { value: 'LIDER DE INVENTARIO', label: 'Líder de Inventario', color: '#10B981', bgColor: '#D1FAE5' },
    { value: 'CONDUCTOR', label: 'Conductor / Piloto', color: '#D97706', bgColor: '#FEF3C7' },
    { value: 'TESORERO', label: 'Tesorero', color: '#1D4ED8', bgColor: '#DBEAFE' },
    { value: 'ENFERMERO', label: 'Enfermero', color: '#EF4444', bgColor: '#FEE2E2' },
    { value: 'AUX ADMINISTRATIVO', label: 'Auxiliar Administrativo', color: '#9333EA', bgColor: '#F5F3FF' },
    { value: 'COMPRADOR', label: 'Comprador Especialista', color: '#475569', bgColor: '#F1F5F9' },
    { value: 'GESTION DE PEDIDOS', label: 'Gestión de Pedidos', color: '#34D399', bgColor: '#D1FAE5' },
    { value: 'COORDINADOR DE OPERACIONES', label: 'Coordinador de Operaciones', color: '#059669', bgColor: '#D1FAE5' },
    { value: 'SERVICIO AL CLIENTE', label: 'Servicio al Cliente', color: '#DB2777', bgColor: '#FCE7F3' },
    { value: 'RR-HH', label: 'Talento Humano (RR-HH)', color: '#7C3AED', bgColor: '#F5F3FF' }
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
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    );
    const [users, setUsers] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showSearchHelp, setShowSearchHelp] = useState(false);
    const [filterRole, setFilterRole] = useState('all');
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
        is_active: true
    });
    const [saving, setSaving] = useState(false);
    const [scrolled, setScrolled] = useState(false);

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
            const { data, error } = await supabase
                .from('collaborators')
                .select('*');

            if (error) throw error;
            setUsers(data || []);
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

    const registerUser = async () => {
        if (!newUser.contact_name) return alert('El nombre es obligatorio');
        if (!newUser.role) return alert('Debes seleccionar un cargo');
        if (!newUser.specialty) return alert('Debes seleccionar una ubicación/sede');
        try {
            setSaving(true);
            const { error } = await supabase
                .from('collaborators')
                .insert([{
                    ...newUser,
                    id: crypto.randomUUID(),
                    is_active: true
                }]);

            if (error) throw error;
            setShowAdd(false);
            setNewUser({ contact_name: '', email: '', phone: '', role: '', specialty: '', is_active: true, is_temporary: false });
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

    const filteredUsers = users.filter(u => {
        const query = searchTerm.trim().toLowerCase();
        let matchesSearch = true;
        
        if (query) {
            if (query.startsWith('#')) {
                matchesSearch = (u.document_id || '').toLowerCase().includes(query.substring(1));
            } else if (query.startsWith('@')) {
                const metaQuery = normalize(query.substring(1));
                const roleLabel = normalize(ROLES.find(r => r.value === u.role)?.label || '');
                const isTempMatch = 'temporal'.includes(metaQuery) && u.is_temporary;
                const isInactiveMatch = ('inactivo'.includes(metaQuery) || 'archivado'.includes(metaQuery)) && u.is_active === false;
                matchesSearch = roleLabel.includes(metaQuery) || normalize(u.specialty || '').includes(metaQuery) || isTempMatch || isInactiveMatch;
            } else {
                const terms = query.split(',').map(t => normalize(t.trim())).filter(Boolean);
                const haystack = normalize([u.contact_name || '', u.document_id || '', u.phone || '', u.contact_phone || '', u.email || '', u.role || ''].join(' '));
                matchesSearch = terms.some(term => haystack.includes(term));
            }
        }

        const matchesRole = filterRole === 'all' || u.role === filterRole;
        const matchesArchived = showArchived || u.is_active !== false;
        return matchesSearch && matchesRole && matchesArchived;
    }).sort((a, b) => {
        if (sortBy === 'name') return (a.contact_name || '').localeCompare(b.contact_name || '');
        if (sortBy === 'role') return (a.role || '').localeCompare(b.role || '');
        if (sortBy === 'specialty') return (a.specialty || '').localeCompare(b.specialty || '');
        return 0;
    });

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
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: 'Outfit, sans-serif' }}>
            
            <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
                <header style={{ 
                    marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', 
                    alignItems: 'center', flexWrap: 'wrap', gap: '1rem',
                    transition: 'all 0.4s ease'
                }}>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: THEME.colors.textMain, letterSpacing: '-0.025em', margin: 0 }}>
                            Gestión de <span style={{ color: THEME.colors.primary }}>Talento Humano</span>
                        </h1>
                        <p style={{ color: THEME.colors.textSecondary, fontSize: '1.1rem', marginTop: '0.5rem', fontWeight: '500' }}>
                            Administra colaboradores, roles y especialidad operativa.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{ display: 'flex', backgroundColor: 'white', padding: '0.4rem', borderRadius: '16px', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                            <button 
                                onClick={() => setViewMode('gallery')}
                                style={{ 
                                    padding: '0.6rem 1rem', borderRadius: '12px', border: 'none', 
                                    backgroundColor: viewMode === 'gallery' ? THEME.colors.primary : 'transparent',
                                    color: viewMode === 'gallery' ? '#FFFFFF' : THEME.colors.textSecondary,
                                    fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s',
                                    display: 'flex', alignItems: 'center', gap: '0.4rem'
                                }}
                            >
                                <LayoutGrid strokeWidth={1.5} size={16} /> Galería
                            </button>
                            <button 
                                onClick={() => setViewMode('list')}
                                style={{ 
                                    padding: '0.6rem 1rem', borderRadius: '12px', border: 'none', 
                                    backgroundColor: viewMode === 'list' ? THEME.colors.primary : 'transparent',
                                    color: viewMode === 'list' ? '#FFFFFF' : THEME.colors.textSecondary,
                                    fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s',
                                    display: 'flex', alignItems: 'center', gap: '0.4rem'
                                }}
                            >
                                <List strokeWidth={1.5} size={16} /> Lista
                            </button>
                        </div>
                        <button 
                            onClick={() => setShowAdd(true)}
                            style={{ 
                                padding: '0.9rem 1.8rem', borderRadius: '18px', backgroundColor: THEME.colors.primary, 
                                color: 'white', border: 'none', fontWeight: '800', cursor: 'pointer', 
                                boxShadow: '0 10px 20px -5px rgba(13, 122, 87, 0.4)',
                                display: 'flex', alignItems: 'center', gap: '0.6rem', transition: 'all 0.2s'
                            }}
                            onMouseOver={e => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.backgroundColor = THEME.colors.primaryHover;
                            }}
                            onMouseOut={e => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.backgroundColor = THEME.colors.primary;
                            }}
                        >
                            <Plus strokeWidth={1.5} size={18} /> Registrar Colaborador
                        </button>
                    </div>
                </header>
                
                {/* SUBTLE DASHBOARD */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                    {[
                        { label: 'Total Equipo', value: users.length, icon: <Users strokeWidth={1.5} size={18} style={{ color: THEME.colors.primary }} />, color: THEME.colors.textMain },
                        { label: 'Activos', value: users.filter(u => u.is_active !== false).length, icon: <CheckCircle2 strokeWidth={1.5} size={18} style={{ color: '#10B981' }} />, color: '#10B981' },
                        { label: 'Temporales', value: users.filter(u => u.is_temporary).length, icon: <Clock strokeWidth={1.5} size={18} style={{ color: '#F59E0B' }} />, color: '#F59E0B' },
                        { label: 'Conductores', value: users.filter(u => u.role === 'CONDUCTOR').length, icon: <Truck strokeWidth={1.5} size={18} style={{ color: '#0891B2' }} />, color: '#0891B2' }
                    ].map((stat, i) => (
                        <div key={i} 
                            style={{ 
                                backgroundColor: THEME.colors.surface, padding: '1.2rem', borderRadius: '20px', border: `1px solid ${THEME.colors.border}`,
                                display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: THEME.shadow.sm,
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                            }}
                            onMouseOver={e => {
                                e.currentTarget.style.transform = 'translateY(-1px)';
                                e.currentTarget.style.boxShadow = THEME.shadow.lg;
                            }}
                            onMouseOut={e => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = THEME.shadow.sm;
                            }}
                        >
                            <div style={{ backgroundColor: THEME.colors.background, width: '45px', height: '45px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {stat.icon}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05rem' }}>{stat.label}</div>
                                <div style={{ fontSize: '1.3rem', fontWeight: '700', color: stat.color }}>{formatNumber(stat.value)}</div>
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ 
                    backgroundColor: THEME.colors.surface, padding: '1rem 1.5rem', borderRadius: '24px', 
                    border: `1px solid ${THEME.colors.border}`, marginBottom: '2.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', 
                    alignItems: 'center', boxShadow: THEME.shadow.md, position: 'sticky', top: '10px', zIndex: 50
                }}>
                    <div style={{ flex: 1, minWidth: '300px', position: 'relative' }}>
                        <div style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                            <Search strokeWidth={1.5} size={18} style={{ color: THEME.colors.textSecondary }} />
                        </div>
                        <input 
                            placeholder="Buscar por nombre, teléfono, rol (@rol), ID o @temporal..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            onFocus={() => setShowSearchHelp(true)}
                            onBlur={() => setTimeout(() => setShowSearchHelp(false), 200)}
                            style={{ 
                                width: '100%', padding: '0.8rem 2.8rem 0.8rem 2.8rem', borderRadius: '14px', 
                                border: `1.5px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background, fontSize: '0.95rem',
                                fontWeight: '600', color: THEME.colors.textMain, outline: 'none'
                            }}
                        />
                        {showSearchHelp && (
                            <div style={{ 
                                position: 'absolute', top: '110%', left: 0, right: 0, backgroundColor: 'white', 
                                padding: '1.2rem', borderRadius: '16px', boxShadow: THEME.shadow.lg,
                                zIndex: 100, border: `1px solid ${THEME.colors.border}`, fontSize: '0.8rem'
                            }}>
                                <div style={{ fontWeight: '800', color: THEME.colors.textMain, marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05rem' }}>
                                    <HelpCircle strokeWidth={1.5} size={16} style={{ color: THEME.colors.primary }} /> Atajos de Búsqueda Avanzada
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                                    <div style={{ color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <code style={{ backgroundColor: THEME.colors.primaryLight, padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', color: THEME.colors.primary }}>@cargo</code> <span style={{fontSize: '0.7rem'}}>Filtra por rol</span>
                                    </div>
                                    <div style={{ color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <code style={{ backgroundColor: THEME.colors.primaryLight, padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', color: THEME.colors.primary }}>@sede</code> <span style={{fontSize: '0.7rem'}}>Filtra por sede</span>
                                    </div>
                                    <div style={{ color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <code style={{ backgroundColor: THEME.colors.primaryLight, padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', color: THEME.colors.primary }}>@temporal</code> <span style={{fontSize: '0.7rem'}}>Solo temporales</span>
                                    </div>
                                    <div style={{ color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <code style={{ backgroundColor: THEME.colors.primaryLight, padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', color: THEME.colors.primary }}>@inactivo</code> <span style={{fontSize: '0.7rem'}}>Solo archivados</span>
                                    </div>
                                    <div style={{ color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <code style={{ backgroundColor: THEME.colors.primaryLight, padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', color: THEME.colors.primary }}>,</code> <span style={{fontSize: '0.7rem'}}>Busca varios ítems</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')}
                                style={{ 
                                    position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)',
                                    background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                    color: THEME.colors.textSecondary, fontWeight: 'bold', padding: '0.2rem'
                                }}
                            >
                                <X strokeWidth={1.5} size={16} />
                            </button>
                        )}
                    </div>
                    <select 
                        value={filterRole} 
                        onChange={e => setFilterRole(e.target.value)} 
                        style={{ 
                            padding: '0.8rem 1.2rem', borderRadius: '14px', border: `1.5px solid ${THEME.colors.border}`, 
                            fontWeight: '700', color: THEME.colors.textSecondary, backgroundColor: 'white', outline: 'none', cursor: 'pointer' 
                        }}
                    >
                        <option value="all">Todos los Roles</option>
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>

                    <button 
                        onClick={() => setShowArchived(!showArchived)}
                        style={{ 
                            padding: '0.8rem 1.2rem', borderRadius: '14px', border: `1px solid ${showArchived ? '#FCA5A5' : THEME.colors.border}`, 
                            fontWeight: '800', color: showArchived ? '#B91C1C' : THEME.colors.textSecondary, 
                            backgroundColor: showArchived ? '#FEF2F2' : 'transparent', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
                        }}
                        onMouseOver={e => {
                            if (!showArchived) {
                                e.currentTarget.style.backgroundColor = THEME.colors.primaryLight;
                                e.currentTarget.style.borderColor = THEME.colors.borderActive;
                            }
                        }}
                        onMouseOut={e => {
                            if (!showArchived) {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget.style.borderColor = THEME.colors.border;
                            }
                        }}
                    >
                        {showArchived ? (
                            <>
                                <EyeOff strokeWidth={1.5} size={16} /> Ocultar Archivados
                            </>
                        ) : (
                            <>
                                <Archive strokeWidth={1.5} size={16} /> Mostrar Archivados
                            </>
                        )}
                    </button>
                </div>

                {loading ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                        {[...Array(6)].map((_, i) => (
                            <div key={i} style={{ height: '240px', backgroundColor: 'white', borderRadius: '24px', animation: 'pulse 1.5s infinite', border: `1px solid ${THEME.colors.border}` }}></div>
                        ))}
                    </div>
                ) : viewMode === 'gallery' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                        {filteredUsers.map(user => {
                            const roleInfo = ROLES.find(r => r.value === user.role) || { label: user.role, color: '#64748B', bgColor: '#F1F5F9' };
                            const avatar = getAvatarStyle(user.contact_name || '');

                            return (
                                <div key={user.id} style={{ 
                                    backgroundColor: THEME.colors.surface, borderRadius: '24px', padding: '1.8rem', border: `1px solid ${THEME.colors.border}`,
                                    boxShadow: THEME.shadow.sm, 
                                    display: 'flex', flexDirection: 'column',
                                    opacity: user.is_active === false ? 0.65 : 1, transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                    position: 'relative', overflow: 'hidden',
                                    cursor: 'default'
                                }}
                                onMouseOver={e => {
                                    e.currentTarget.style.transform = 'translateY(-3px)';
                                    e.currentTarget.style.boxShadow = THEME.shadow.lg;
                                    e.currentTarget.style.borderColor = THEME.colors.borderActive;
                                }}
                                onMouseOut={e => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = THEME.shadow.sm;
                                    e.currentTarget.style.borderColor = THEME.colors.border;
                                }}
                                >
                                    {/* Status Badge - Top Row */}
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                                        <span style={{ 
                                            padding: '0.25rem 0.6rem', borderRadius: '8px', fontSize: '0.6rem', fontWeight: '900',
                                            backgroundColor: user.is_active === false ? '#FEE2E2' : THEME.colors.primaryLight,
                                            color: user.is_active === false ? '#B91C1C' : THEME.colors.primary,
                                            letterSpacing: '0.05em'
                                        }}>
                                            {user.is_active === false ? 'ARCHIVADO' : 'ACTIVO'}
                                        </span>
                                    </div>

                                    {/* Avatar & Name - Second Row */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.2rem' }}>
                                        <div style={{ 
                                            width: '48px', height: '48px', borderRadius: '14px', 
                                            backgroundColor: avatar.bg, 
                                            color: avatar.color, display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                            fontWeight: '900', fontSize: '1rem', flexShrink: 0, 
                                            border: avatar.border,
                                            boxShadow: '0 4px 10px rgba(0,0,0,0.04)'
                                        }}>
                                            {avatar.initials}
                                        </div>
                                        <div style={{ overflow: 'hidden', flex: 1 }}>
                                            <h3 style={{ margin: 0, fontWeight: '700', color: THEME.colors.textMain, fontSize: '1.05rem', lineHeight: '1.2', letterSpacing: '-0.02em', wordBreak: 'break-word' }}>
                                                {user.contact_name}
                                            </h3>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.3rem' }}>
                                                <span style={{ 
                                                    fontSize: '0.6rem', fontWeight: '900', 
                                                    color: roleInfo.color, backgroundColor: roleInfo.bgColor, 
                                                    padding: '0.15rem 0.5rem', borderRadius: '6px', textTransform: 'uppercase'
                                                }}>
                                                    {roleInfo.label}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem', padding: '0.8rem', backgroundColor: THEME.colors.background, borderRadius: THEME.radius.lg }}>
                                        {user.is_temporary && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                <Clock strokeWidth={1.5} size={14} style={{ color: '#EF4444' }} />
                                                <span style={{ fontSize: '0.6rem', fontWeight: '900', backgroundColor: '#FEE2E2', color: '#B91C1C', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                                                    PERSONAL TEMPORAL
                                                </span>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                            <Phone strokeWidth={1.5} size={14} style={{ color: THEME.colors.textSecondary }} />
                                            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: THEME.colors.textMain }}>
                                                {user.phone || user.contact_phone || '---'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                            <Mail strokeWidth={1.5} size={14} style={{ color: THEME.colors.textSecondary }} />
                                            <span style={{ fontSize: '0.8rem', fontWeight: '500', color: THEME.colors.textSecondary, wordBreak: 'break-all' }}>
                                                {user.email || 'Sin correo'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                            <MapPin strokeWidth={1.5} size={14} style={{ color: THEME.colors.primary }} />
                                            <span style={{ fontSize: '0.8rem', fontWeight: '800', color: THEME.colors.primary, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                                {user.specialty || 'Sede FruFresco'}
                                            </span>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '1.2rem', display: 'flex', gap: '0.6rem' }}>
                                        <button 
                                            onClick={() => setEditingUser(user)}
                                            style={{ 
                                                flex: 1, padding: '0.6rem', borderRadius: '12px', border: `1px solid ${THEME.colors.border}`, 
                                                backgroundColor: 'white', color: THEME.colors.textSecondary, fontWeight: '800', 
                                                cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.75rem',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem'
                                            }}
                                            onMouseOver={e => { e.currentTarget.style.backgroundColor = THEME.colors.primaryLight; e.currentTarget.style.borderColor = THEME.colors.borderActive; }}
                                            onMouseOut={e => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
                                        >
                                            <Edit2 strokeWidth={1.5} size={14} /> Editar
                                        </button>
                                        <button 
                                            onClick={() => toggleUserStatus(user.id, user.is_active !== false)}
                                            style={{ 
                                                flex: 1, padding: '0.6rem', borderRadius: '12px', 
                                                border: `1px solid ${user.is_active === false ? THEME.colors.primary : '#FCA5A5'}`, 
                                                backgroundColor: 'transparent', 
                                                color: user.is_active === false ? THEME.colors.primary : '#EF4444', 
                                                fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.75rem',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem'
                                            }}
                                            onMouseOver={e => {
                                                e.currentTarget.style.backgroundColor = user.is_active === false ? THEME.colors.primaryLight : '#FEE2E2';
                                            }}
                                            onMouseOut={e => {
                                                e.currentTarget.style.backgroundColor = 'transparent';
                                            }}
                                        >
                                            {user.is_active === false ? (
                                                <>
                                                    <FolderOpen strokeWidth={1.5} size={14} /> Reactivar
                                                </>
                                            ) : (
                                                <>
                                                    <EyeOff strokeWidth={1.5} size={14} /> Archivar
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: '24px', border: `1px solid ${THEME.colors.border}`, overflow: 'hidden', boxShadow: THEME.shadow.sm }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ backgroundColor: THEME.colors.background, borderBottom: `2px solid ${THEME.colors.border}` }}>
                                <tr>
                                    <th style={{ padding: '0.8rem 1.25rem', textAlign: 'left', color: THEME.colors.textSecondary, fontSize: '0.65rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05rem' }}>Colaborador</th>
                                    <th style={{ padding: '0.8rem 1.25rem', textAlign: 'left', color: THEME.colors.textSecondary, fontSize: '0.65rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05rem' }}>Rol / Especialidad</th>
                                    <th style={{ padding: '0.8rem 1.25rem', textAlign: 'left', color: THEME.colors.textSecondary, fontSize: '0.65rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05rem' }}>Contacto</th>
                                    <th style={{ padding: '0.8rem 1.25rem', textAlign: 'right', color: THEME.colors.textSecondary, fontSize: '0.65rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05rem' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.map(user => {
                                    const roleInfo = ROLES.find(r => r.value === user.role) || { label: user.role, color: '#64748B', bgColor: '#F1F5F9' };
                                    return (
                                        <tr key={user.id} className="collaborator-row" style={{ borderBottom: `1px solid ${THEME.colors.border}`, opacity: user.is_active === false ? 0.65 : 1 }}>
                                            <td style={{ padding: '0.65rem 1.25rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    {(() => {
                                                        const av = getAvatarStyle(user.contact_name || '');
                                                        return (
                                                            <div style={{ 
                                                                width: '42px', height: '42px', borderRadius: '12px', 
                                                                backgroundColor: av.bg, 
                                                                color: av.color, display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                                                fontWeight: '900', fontSize: '0.85rem', border: av.border
                                                            }}>
                                                                {av.initials}
                                                            </div>
                                                        );
                                                    })()}
                                                    <div>
                                                        <div style={{ fontWeight: '700', color: THEME.colors.textMain }}>{user.contact_name}</div>
                                                        <div style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                            ID: {user.document_id || '---'}
                                                            {user.is_temporary && (
                                                                <span style={{ fontSize: '0.55rem', fontWeight: '900', backgroundColor: '#FEE2E2', color: '#B91C1C', padding: '1px 4px', borderRadius: '4px' }}>TEMP</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.65rem 1.25rem' }}>
                                                <span style={{ fontSize: '0.7rem', fontWeight: '900', color: roleInfo.color, backgroundColor: roleInfo.bgColor, padding: '3px 8px', borderRadius: '6px' }}>
                                                    {roleInfo.label.toUpperCase()}
                                                </span>
                                                <div style={{ fontSize: '0.75rem', color: THEME.colors.primary, fontWeight: '800', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    {user.specialty || 'GENERAL'}
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.65rem 1.25rem' }}>
                                                <div style={{ fontWeight: '700', color: THEME.colors.textMain, fontSize: '0.85rem' }}>{user.phone || user.contact_phone || '---'}</div>
                                                <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary }}>{user.email || '---'}</div>
                                            </td>
                                            <td style={{ padding: '0.65rem 1.25rem', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                    <button 
                                                        onClick={() => setEditingUser(user)} 
                                                        style={{ 
                                                            background: 'none', border: `1px solid ${THEME.colors.border}`, borderRadius: '8px', 
                                                            cursor: 'pointer', padding: '0.4rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                            color: THEME.colors.textSecondary, transition: 'all 0.2s'
                                                        }} 
                                                        title="Editar"
                                                        onMouseOver={e => { e.currentTarget.style.borderColor = THEME.colors.borderActive; e.currentTarget.style.backgroundColor = THEME.colors.primaryLight; }}
                                                        onMouseOut={e => { e.currentTarget.style.borderColor = THEME.colors.border; e.currentTarget.style.backgroundColor = 'transparent'; }}
                                                    >
                                                        <Edit2 strokeWidth={1.5} size={14} />
                                                    </button>
                                                    <button 
                                                        onClick={() => toggleUserStatus(user.id, user.is_active !== false)} 
                                                        style={{ 
                                                            background: 'none', border: `1px solid ${user.is_active === false ? THEME.colors.primary : '#FCA5A5'}`, 
                                                            borderRadius: '8px', cursor: 'pointer', padding: '0.4rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                            color: user.is_active === false ? THEME.colors.primary : '#EF4444', transition: 'all 0.2s'
                                                        }} 
                                                        title={user.is_active === false ? 'Reactivar' : 'Archivar'}
                                                        onMouseOver={e => { e.currentTarget.style.backgroundColor = user.is_active === false ? THEME.colors.primaryLight : '#FEE2E2'; }}
                                                        onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                                    >
                                                        {user.is_active === false ? <FolderOpen strokeWidth={1.5} size={14} /> : <EyeOff strokeWidth={1.5} size={14} />}
                                                    </button>
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

            {/* MODAL EDITAR */}
            {editingUser && (
                <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'white', padding: '2.5rem', borderRadius: '24px', border: `1px solid ${THEME.colors.border}`, width: '100%', maxWidth: '500px', boxShadow: THEME.shadow.lg }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: THEME.colors.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.colors.primary }}>
                                    <Edit2 strokeWidth={1.5} size={18} />
                                </div>
                                <h2 style={{ margin: 0, fontWeight: '700', color: THEME.colors.textMain, fontSize: '1.4rem' }}>
                                    Editar Perfil
                                </h2>
                            </div>
                            <button 
                                onClick={() => setEditingUser(null)} 
                                style={{ 
                                    background: THEME.colors.background, border: 'none', width: '32px', height: '32px', borderRadius: '50%', 
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.colors.textSecondary, transition: 'all 0.2s' 
                                }}
                                onMouseOver={e => e.currentTarget.style.backgroundColor = THEME.colors.border}
                                onMouseOut={e => e.currentTarget.style.backgroundColor = THEME.colors.background}
                            >
                                <X strokeWidth={1.5} size={18} />
                            </button>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nombre Completo</label>
                                <input 
                                    value={editingUser.contact_name} 
                                    onChange={e => setEditingUser({...editingUser, contact_name: e.target.value})}
                                    style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: `1.5px solid ${THEME.colors.border}`, fontWeight: '600', color: THEME.colors.textMain, outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Teléfono Móvil</label>
                                    <input value={editingUser.phone || editingUser.contact_phone || ''} onChange={e => setEditingUser({...editingUser, phone: e.target.value, contact_phone: e.target.value})} style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: `1.5px solid ${THEME.colors.border}`, fontWeight: '600', color: THEME.colors.textMain, boxSizing: 'border-box', outline: 'none' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cédula / ID</label>
                                    <input value={editingUser.document_id || ''} onChange={e => setEditingUser({...editingUser, document_id: e.target.value})} style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: `1.5px solid ${THEME.colors.border}`, fontWeight: '600', color: THEME.colors.textMain, boxSizing: 'border-box', outline: 'none' }} />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Correo Electrónico</label>
                                <input 
                                    value={editingUser.email || ''} 
                                    onChange={e => setEditingUser({...editingUser, email: e.target.value})}
                                    style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: `1.5px solid ${THEME.colors.border}`, fontWeight: '600', color: THEME.colors.textMain, outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cargo en la Compañía</label>
                                <select value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value})} style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: `1.5px solid ${THEME.colors.border}`, fontWeight: '700', color: THEME.colors.textMain, backgroundColor: 'white', outline: 'none', cursor: 'pointer' }}>
                                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Especialidad / Sede</label>
                                <select value={editingUser.specialty || ''} onChange={e => setEditingUser({...editingUser, specialty: e.target.value})} style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: `1.5px solid ${THEME.colors.border}`, fontWeight: '700', color: THEME.colors.textMain, backgroundColor: 'white', outline: 'none', cursor: 'pointer' }}>
                                    <option value="">Seleccionar Ubicación...</option>
                                    {dynamicSpecialties.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.8rem', backgroundColor: THEME.colors.background, borderRadius: '12px', border: `1px solid ${THEME.colors.border}` }}>
                                <input 
                                    type="checkbox" 
                                    id="edit_is_temporary"
                                    checked={editingUser.is_temporary || false} 
                                    onChange={e => setEditingUser({...editingUser, is_temporary: e.target.checked})}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: THEME.colors.primary }}
                                />
                                <label htmlFor="edit_is_temporary" style={{ fontSize: '0.85rem', fontWeight: '700', color: THEME.colors.textMain, cursor: 'pointer' }}>Personal Temporal</label>
                            </div>

                            <button 
                                onClick={() => updateProfile(editingUser.id, editingUser)} 
                                style={{ 
                                    marginTop: '1rem', padding:'1rem', borderRadius: '12px', border: 'none', 
                                    backgroundColor: THEME.colors.primary, color:'white', fontWeight:'800', cursor: 'pointer',
                                    boxShadow: THEME.shadow.md, fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                    transition: 'all 0.2s'
                                }}
                                onMouseOver={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                                onMouseOut={e => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                            >
                                {saving ? <Clock strokeWidth={1.5} size={18} className="animate-spin" /> : <FolderOpen strokeWidth={1.5} size={18} />}
                                {saving ? 'Guardando...' : 'GUARDAR CAMBIOS'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL REGISTRO */}
            {showAdd && (
                <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'white', padding: '2.5rem', borderRadius: '24px', border: `1px solid ${THEME.colors.border}`, width: '100%', maxWidth: '500px', boxShadow: THEME.shadow.lg }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: THEME.colors.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.colors.primary }}>
                                    <Plus strokeWidth={1.5} size={18} />
                                </div>
                                <h2 style={{ margin: 0, fontWeight: '700', color: THEME.colors.textMain, fontSize: '1.4rem' }}>
                                    Nuevo Colaborador
                                </h2>
                            </div>
                            <button 
                                onClick={() => setShowAdd(false)} 
                                style={{ 
                                    background: THEME.colors.background, border: 'none', width: '32px', height: '32px', borderRadius: '50%', 
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.colors.textSecondary, transition: 'all 0.2s' 
                                }}
                                onMouseOver={e => e.currentTarget.style.backgroundColor = THEME.colors.border}
                                onMouseOut={e => e.currentTarget.style.backgroundColor = THEME.colors.background}
                            >
                                <X strokeWidth={1.5} size={18} />
                            </button>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            <input 
                                placeholder="Nombre completo" 
                                value={newUser.contact_name} 
                                onChange={e => setNewUser({...newUser, contact_name: e.target.value})}
                                style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: `1.5px solid ${THEME.colors.border}`, fontWeight: '600', color: THEME.colors.textMain, boxSizing: 'border-box', outline: 'none' }}
                            />
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <input placeholder="Cédula" value={newUser.document_id || ''} onChange={e => setNewUser({...newUser, document_id: e.target.value})} style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: `1.5px solid ${THEME.colors.border}`, fontWeight: '600', color: THEME.colors.textMain, boxSizing: 'border-box', outline: 'none' }} />
                                <input placeholder="Teléfono" value={newUser.phone || ''} onChange={e => setNewUser({...newUser, phone: e.target.value})} style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: `1.5px solid ${THEME.colors.border}`, fontWeight: '600', color: THEME.colors.textMain, boxSizing: 'border-box', outline: 'none' }} />
                            </div>

                            <input placeholder="Correo electrónico" value={newUser.email || ''} onChange={e => setNewUser({...newUser, email: e.target.value})} style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: `1.5px solid ${THEME.colors.border}`, fontWeight: '600', color: THEME.colors.textMain, boxSizing: 'border-box', outline: 'none' }} />
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})} style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: `1.5px solid ${THEME.colors.border}`, fontWeight: '700', color: THEME.colors.textMain, backgroundColor: 'white', outline: 'none', cursor: 'pointer' }}>
                                    <option value="" disabled>Cargo...</option>
                                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                                <select value={newUser.specialty} onChange={e => setNewUser({...newUser, specialty: e.target.value})} style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: `1.5px solid ${THEME.colors.border}`, fontWeight: '700', color: THEME.colors.textMain, backgroundColor: 'white', outline: 'none', cursor: 'pointer' }}>
                                    <option value="" disabled>Ubicación...</option>
                                    {dynamicSpecialties.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.8rem', backgroundColor: THEME.colors.background, borderRadius: '12px', border: `1px solid ${THEME.colors.border}` }}>
                                <input 
                                    type="checkbox" 
                                    id="is_temporary"
                                    checked={newUser.is_temporary || false} 
                                    onChange={e => setNewUser({...newUser, is_temporary: e.target.checked})}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: THEME.colors.primary }}
                                />
                                <label htmlFor="is_temporary" style={{ fontSize: '0.85rem', fontWeight: '700', color: THEME.colors.textMain, cursor: 'pointer' }}>Personal Temporal</label>
                            </div>

                            <button 
                                onClick={registerUser} 
                                style={{ 
                                    marginTop: '1rem', padding:'1rem', borderRadius: '12px', border: 'none', 
                                    backgroundColor: THEME.colors.primary, color:'white', fontWeight:'800', cursor: 'pointer',
                                    boxShadow: THEME.shadow.md, fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                    transition: 'all 0.2s'
                                }}
                                onMouseOver={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                                onMouseOut={e => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                            >
                                {saving ? <Clock strokeWidth={1.5} size={18} className="animate-spin" /> : <Plus strokeWidth={1.5} size={18} />}
                                {saving ? 'Registrando...' : 'COMPLETAR REGISTRO'}
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
            `}</style>
        </main>
    );
}

