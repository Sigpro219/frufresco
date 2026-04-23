'use client';

import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { createClient } from '@supabase/supabase-js';

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
        <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
            <Navbar />
            
            <main style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
                <header style={{ 
                    marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', 
                    alignItems: 'center', flexWrap: 'wrap', gap: '1rem',
                    transition: 'all 0.4s ease'
                }}>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#0F172A', letterSpacing: '-0.025em', margin: 0 }}>
                            Gestión de <span style={{ color: '#0891B2' }}>Talento Humano</span>
                        </h1>
                        <p style={{ color: '#64748B', fontSize: '1.1rem', marginTop: '0.5rem', fontWeight: '500' }}>
                            Administra colaboradores, roles y especialidad operativa.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{ display: 'flex', backgroundColor: 'white', padding: '0.4rem', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                            <button 
                                onClick={() => setViewMode('gallery')}
                                style={{ 
                                    padding: '0.6rem 1rem', borderRadius: '12px', border: 'none', 
                                    backgroundColor: viewMode === 'gallery' ? '#F1F5F9' : 'transparent',
                                    color: viewMode === 'gallery' ? '#0F172A' : '#94A3B8',
                                    fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s'
                                }}
                            >🖼️ Galería</button>
                            <button 
                                onClick={() => setViewMode('list')}
                                style={{ 
                                    padding: '0.6rem 1rem', borderRadius: '12px', border: 'none', 
                                    backgroundColor: viewMode === 'list' ? '#F1F5F9' : 'transparent',
                                    color: viewMode === 'list' ? '#0F172A' : '#94A3B8',
                                    fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s'
                                }}
                            >📋 Lista</button>
                        </div>
                        <button 
                            onClick={() => setShowAdd(true)}
                            style={{ 
                                padding: '0.9rem 1.8rem', borderRadius: '18px', backgroundColor: '#0891B2', 
                                color: 'white', border: 'none', fontWeight: '800', cursor: 'pointer', 
                                boxShadow: '0 10px 20px -5px rgba(8, 145, 178, 0.4)',
                                display: 'flex', alignItems: 'center', gap: '0.6rem', transition: 'transform 0.2s'
                            }}
                            onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                            onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                        >
                            <span style={{ fontSize: '1.2rem' }}>+</span> Registrar Colaborador
                        </button>
                    </div>
                </header>
                
                {/* SUBTLE DASHBOARD */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                    {[
                        { label: 'Total Equipo', value: users.length, icon: '👥', color: '#0F172A' },
                        { label: 'Activos', value: users.filter(u => u.is_active !== false).length, icon: '✅', color: '#10B981' },
                        { label: 'Temporales', value: users.filter(u => u.is_temporary).length, icon: '⏳', color: '#F59E0B' },
                        { label: 'Conductores', value: users.filter(u => u.role === 'CONDUCTOR').length, icon: '🚛', color: '#0891B2' }
                    ].map((stat, i) => (
                        <div key={i} style={{ 
                            backgroundColor: 'white', padding: '1.2rem', borderRadius: '20px', border: '1px solid #E2E8F0',
                            display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)'
                        }}>
                            <div style={{ fontSize: '1.5rem', backgroundColor: '#F8FAFC', width: '45px', height: '45px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {stat.icon}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05rem' }}>{stat.label}</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: '900', color: stat.color }}>{stat.value}</div>
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ 
                    backgroundColor: 'white', padding: '1rem 1.5rem', borderRadius: '24px', 
                    border: '1px solid #E2E8F0', marginBottom: '2.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', 
                    alignItems: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', position: 'sticky', top: '10px', zIndex: 50
                }}>
                    <div style={{ flex: 1, minWidth: '300px', position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                        <input 
                            placeholder="Buscar por nombre, teléfono, rol (@rol), ID o @temporal..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            onFocus={() => setShowSearchHelp(true)}
                            onBlur={() => setTimeout(() => setShowSearchHelp(false), 200)}
                            style={{ 
                                width: '100%', padding: '0.8rem 2.8rem 0.8rem 2.8rem', borderRadius: '14px', 
                                border: '1.5px solid #F1F5F9', backgroundColor: '#F8FAFC', fontSize: '0.95rem',
                                fontWeight: '600', color: '#1E293B', outline: 'none'
                            }}
                        />
                        {showSearchHelp && (
                            <div style={{ 
                                position: 'absolute', top: '110%', left: 0, right: 0, backgroundColor: 'white', 
                                padding: '1.2rem', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
                                zIndex: 100, border: '1px solid #E2E8F0', fontSize: '0.8rem'
                            }}>
                                <div style={{ fontWeight: '900', color: '#0F172A', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05rem' }}>
                                    <span style={{ fontSize: '1rem' }}>💡</span> Atajos de Búsqueda Avanzada
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                                    <div style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <code style={{ backgroundColor: '#F1F5F9', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', color: '#0891B2' }}>@cargo</code> <span style={{fontSize: '0.7rem'}}>Filtra por rol</span>
                                    </div>
                                    <div style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <code style={{ backgroundColor: '#F1F5F9', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', color: '#0891B2' }}>@sede</code> <span style={{fontSize: '0.7rem'}}>Filtra por sede</span>
                                    </div>
                                    <div style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <code style={{ backgroundColor: '#F1F5F9', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', color: '#0891B2' }}>@temporal</code> <span style={{fontSize: '0.7rem'}}>Solo temporales</span>
                                    </div>
                                    <div style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <code style={{ backgroundColor: '#F1F5F9', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', color: '#0891B2' }}>@inactivo</code> <span style={{fontSize: '0.7rem'}}>Solo archivados</span>
                                    </div>
                                    <div style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <code style={{ backgroundColor: '#F1F5F9', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', color: '#0891B2' }}>,</code> <span style={{fontSize: '0.7rem'}}>Busca varios ítems</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')}
                                style={{ 
                                    position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)',
                                    background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem',
                                    color: '#94A3B8', fontWeight: 'bold', padding: '0.2rem'
                                }}
                            >✕</button>
                        )}
                    </div>
                    <select 
                        value={filterRole} 
                        onChange={e => setFilterRole(e.target.value)} 
                        style={{ padding: '0.8rem 1.2rem', borderRadius: '14px', border: '1.5px solid #F1F5F9', fontWeight: '700', color: '#475569', backgroundColor: 'white', outline: 'none' }}
                    >
                        <option value="all">🎭 Todos los Roles</option>
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>

                    <button 
                        onClick={() => setShowArchived(!showArchived)}
                        style={{ 
                            padding: '0.8rem 1.2rem', borderRadius: '14px', border: '1.5px solid #F1F5F9', 
                            fontWeight: '800', color: showArchived ? '#B91C1C' : '#64748B', 
                            backgroundColor: showArchived ? '#FEF2F2' : 'white', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
                        }}
                    >
                        {showArchived ? '👁️ Ocultar Archivados' : '📁 Mostrar Archivados'}
                    </button>
                </div>

                {loading ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                        {[...Array(6)].map((_, i) => (
                            <div key={i} style={{ height: '240px', backgroundColor: 'white', borderRadius: '24px', animation: 'pulse 1.5s infinite', border: '1px solid #E2E8F0' }}></div>
                        ))}
                    </div>
                ) : viewMode === 'gallery' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                        {filteredUsers.map(user => {
                            const roleInfo = ROLES.find(r => r.value === user.role) || { label: user.role, color: '#64748B', bgColor: '#F1F5F9' };
                            const avatar = getAvatarStyle(user.contact_name || '');

                            return (
                                <div key={user.id} style={{ 
                                    backgroundColor: 'white', borderRadius: '28px', padding: '1.8rem', border: '1px solid rgba(226, 232, 240, 0.8)',
                                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.03), 0 8px 10px -6px rgba(0,0,0,0.03)', 
                                    display: 'flex', flexDirection: 'column',
                                    opacity: user.is_active === false ? 0.6 : 1, transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                                    position: 'relative', overflow: 'hidden',
                                    cursor: 'default'
                                }}
                                onMouseOver={e => {
                                    e.currentTarget.style.transform = 'translateY(-5px)';
                                    e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0,0,0,0.08), 0 10px 10px -5px rgba(0,0,0,0.04)';
                                }}
                                onMouseOut={e => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.03), 0 8px 10px -6px rgba(0,0,0,0.03)';
                                }}
                                >
                                    {/* Status Badge - Top Row */}
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                                        <span style={{ 
                                            padding: '0.25rem 0.6rem', borderRadius: '8px', fontSize: '0.6rem', fontWeight: '900',
                                            backgroundColor: user.is_active === false ? '#FEE2E2' : '#DCFCE7',
                                            color: user.is_active === false ? '#B91C1C' : '#15803D',
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
                                            <h3 style={{ margin: 0, fontWeight: '900', color: '#0F172A', fontSize: '1.05rem', lineHeight: '1.2', letterSpacing: '-0.02em', wordBreak: 'break-word' }}>
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

                                        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem', padding: '0.8rem', backgroundColor: '#F8FAFC', borderRadius: '16px' }}>
                                            {user.is_temporary && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                    <span style={{ fontSize: '0.85rem' }}>⏳</span>
                                                    <span style={{ fontSize: '0.6rem', fontWeight: '900', backgroundColor: '#FEE2E2', color: '#B91C1C', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                                                        PERSONAL TEMPORAL
                                                    </span>
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                            <span style={{ fontSize: '0.85rem', filter: 'grayscale(1)' }}>📞</span>
                                            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155' }}>
                                                {user.phone || user.contact_phone || '---'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                            <span style={{ fontSize: '0.85rem', filter: 'grayscale(1)' }}>📧</span>
                                            <span style={{ fontSize: '0.8rem', fontWeight: '500', color: '#64748B', wordBreak: 'break-all' }}>
                                                {user.email || 'Sin correo'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                            <span style={{ fontSize: '0.85rem', filter: 'grayscale(1)' }}>🏬</span>
                                            <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#0891B2', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                                {user.specialty || 'Sede FruFresco'}
                                            </span>
                                            {user.specialty?.includes('TEMPORAL') && (
                                                <span style={{ 
                                                    fontSize: '0.6rem', fontWeight: '900', backgroundColor: '#FEE2E2', color: '#B91C1C', 
                                                    padding: '0.1rem 0.4rem', borderRadius: '4px', marginLeft: '0.5rem' 
                                                }}>
                                                    TEMPORAL
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '1.2rem', display: 'flex', gap: '0.6rem' }}>
                                        <button 
                                            onClick={() => setEditingUser(user)}
                                            style={{ 
                                                flex: 1, padding: '0.6rem', borderRadius: '12px', border: '1.5px solid #E2E8F0', 
                                                backgroundColor: 'white', color: '#334155', fontWeight: '800', 
                                                cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.75rem'
                                            }}
                                            onMouseOver={e => { e.currentTarget.style.backgroundColor = '#F8FAFC'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
                                            onMouseOut={e => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
                                        >✏️ Editar</button>
                                        <button 
                                            onClick={() => toggleUserStatus(user.id, user.is_active !== false)}
                                            style={{ 
                                                flex: 1, padding: '0.6rem', borderRadius: '12px', border: 'none', 
                                                backgroundColor: user.is_active === false ? '#DCFCE7' : '#FEE2E2', 
                                                color: user.is_active === false ? '#15803D' : '#B91C1C', 
                                                fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.75rem'
                                            }}
                                            onMouseOver={e => e.currentTarget.style.filter = 'brightness(0.95)'}
                                            onMouseOut={e => e.currentTarget.style.filter = 'brightness(1)'}
                                        >
                                            {user.is_active === false ? '📂 Reactivar' : '🔒 Archivar'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ backgroundColor: 'white', borderRadius: '24px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                                <tr>
                                    <th style={{ padding: '1.2rem 1.5rem', textAlign: 'left', color: '#64748B', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' }}>Colaborador</th>
                                    <th style={{ padding: '1.2rem 1.5rem', textAlign: 'left', color: '#64748B', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' }}>Rol / Especialidad</th>
                                    <th style={{ padding: '1.2rem 1.5rem', textAlign: 'left', color: '#64748B', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' }}>Contacto</th>
                                    <th style={{ padding: '1.2rem 1.5rem', textAlign: 'right', color: '#64748B', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.map(user => {
                                    const roleInfo = ROLES.find(r => r.value === user.role) || { label: user.role, color: '#64748B', bgColor: '#F1F5F9' };
                                    return (
                                        <tr key={user.id} style={{ borderBottom: '1px solid #F1F5F9', opacity: user.is_active === false ? 0.6 : 1 }}>
                                            <td style={{ padding: '1.2rem 1.5rem' }}>
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
                                                        <div style={{ fontWeight: '800', color: '#0F172A' }}>{user.contact_name}</div>
                                                        <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                            ID: {user.document_id || '---'}
                                                            {user.is_temporary && (
                                                                <span style={{ fontSize: '0.55rem', fontWeight: '900', backgroundColor: '#FEE2E2', color: '#B91C1C', padding: '1px 4px', borderRadius: '4px' }}>TEMP</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '1.2rem 1.5rem' }}>
                                                <span style={{ fontSize: '0.7rem', fontWeight: '900', color: roleInfo.color, backgroundColor: roleInfo.bgColor, padding: '3px 8px', borderRadius: '6px' }}>
                                                    {roleInfo.label.toUpperCase()}
                                                </span>
                                                <div style={{ fontSize: '0.75rem', color: '#0891B2', fontWeight: '800', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    {user.specialty || 'GENERAL'}
                                                    {user.specialty?.includes('TEMPORAL') && (
                                                        <span style={{ fontSize: '0.55rem', fontWeight: '900', backgroundColor: '#FEE2E2', color: '#B91C1C', padding: '1px 4px', borderRadius: '4px' }}>TEMPORAL</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ padding: '1.2rem 1.5rem' }}>
                                                <div style={{ fontWeight: '700', color: '#334155', fontSize: '0.85rem' }}>{user.phone || user.contact_phone || '---'}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{user.email || '---'}</div>
                                            </td>
                                            <td style={{ padding: '1.2rem 1.5rem', textAlign: 'right' }}>
                                                <button onClick={() => setEditingUser(user)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.4rem', fontSize: '1rem' }} title="Editar">✏️</button>
                                                <button onClick={() => toggleUserStatus(user.id, user.is_active !== false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.4rem', fontSize: '1rem' }} title="Cambiar Estado">
                                                    {user.is_active === false ? '📂' : '🔒'}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>

            {/* MODAL EDITAR */}
            {editingUser && (
                <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'white', padding: '2.5rem', borderRadius: '32px', width: '100%', maxWidth: '550px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h2 style={{ margin: 0, fontWeight: '900', color: '#0F172A', fontSize: '1.5rem' }}>✏️ Perfil de <span style={{ color: '#0891B2' }}>Colaborador</span></h2>
                            <button onClick={() => setEditingUser(null)} style={{ background: '#F1F5F9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '900', color: '#64748B', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Nombre Completo</label>
                                <input 
                                    value={editingUser.contact_name} 
                                    onChange={e => setEditingUser({...editingUser, contact_name: e.target.value})}
                                    style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', fontWeight: '600', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '900', color: '#64748B', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Teléfono Móvil</label>
                                    <input value={editingUser.phone || editingUser.contact_phone || ''} onChange={e => setEditingUser({...editingUser, phone: e.target.value, contact_phone: e.target.value})} style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', fontWeight: '600', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '900', color: '#64748B', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Cédula / ID</label>
                                    <input value={editingUser.document_id || ''} onChange={e => setEditingUser({...editingUser, document_id: e.target.value})} style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', fontWeight: '600', boxSizing: 'border-box' }} />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '900', color: '#64748B', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Correo Electrónico</label>
                                <input 
                                    value={editingUser.email || ''} 
                                    onChange={e => setEditingUser({...editingUser, email: e.target.value})}
                                    style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', fontWeight: '600', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '900', color: '#64748B', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Cargo en la Compañía</label>
                                <select value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value})} style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', fontWeight: '700', backgroundColor: 'white' }}>
                                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '900', color: '#64748B', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Especialidad / Departamento / Sede</label>
                                <select value={editingUser.specialty || ''} onChange={e => setEditingUser({...editingUser, specialty: e.target.value})} style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', fontWeight: '700', backgroundColor: 'white' }}>
                                    <option value="">Seleccionar Ubicación...</option>
                                    {dynamicSpecialties.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '14px', border: '1.5px solid #F1F5F9' }}>
                                <input 
                                    type="checkbox" 
                                    id="edit_is_temporary"
                                    checked={editingUser.is_temporary || false} 
                                    onChange={e => setEditingUser({...editingUser, is_temporary: e.target.checked})}
                                    style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#0891B2' }}
                                />
                                <label htmlFor="edit_is_temporary" style={{ fontSize: '0.85rem', fontWeight: '800', color: '#1E293B', cursor: 'pointer' }}>Personal Temporal</label>
                            </div>

                            <button 
                                onClick={() => updateProfile(editingUser.id, editingUser)} 
                                style={{ 
                                    marginTop: '1rem', padding:'1.1rem', borderRadius:'18px', border: 'none', 
                                    backgroundColor:'#0891B2', color:'white', fontWeight:'900', cursor: 'pointer',
                                    boxShadow: '0 10px 15px -3px rgba(8, 145, 178, 0.3)', fontSize: '1rem'
                                }}
                            >
                                {saving ? '⏳ Guardando...' : '💾 GUARDAR CAMBIOS'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL REGISTRO */}
            {showAdd && (
                <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'white', padding: '2.5rem', borderRadius: '32px', width: '100%', maxWidth: '550px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h2 style={{ margin: 0, fontWeight: '900', color: '#0F172A', fontSize: '1.5rem' }}>✨ Nuevo <span style={{ color: '#0891B2' }}>Colaborador</span></h2>
                            <button onClick={() => setShowAdd(false)} style={{ background: '#F1F5F9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            <input 
                                placeholder="Nombre completo" 
                                value={newUser.contact_name} 
                                onChange={e => setNewUser({...newUser, contact_name: e.target.value})}
                                style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', fontWeight: '600', boxSizing: 'border-box' }}
                            />
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <input placeholder="Cédula" value={newUser.document_id || ''} onChange={e => setNewUser({...newUser, document_id: e.target.value})} style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', fontWeight: '600', boxSizing: 'border-box' }} />
                                <input placeholder="Teléfono" value={newUser.phone || ''} onChange={e => setNewUser({...newUser, phone: e.target.value})} style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', fontWeight: '600', boxSizing: 'border-box' }} />
                            </div>

                            <input placeholder="Correo electrónico" value={newUser.email || ''} onChange={e => setNewUser({...newUser, email: e.target.value})} style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', fontWeight: '600', boxSizing: 'border-box' }} />
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})} style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', fontWeight: '700', backgroundColor: 'white' }}>
                                    <option value="" disabled>Seleccionar Cargo...</option>
                                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                                <select value={newUser.specialty} onChange={e => setNewUser({...newUser, specialty: e.target.value})} style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', fontWeight: '700', backgroundColor: 'white' }}>
                                    <option value="" disabled>Seleccionar Ubicación...</option>
                                    {dynamicSpecialties.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '14px', border: '1.5px solid #F1F5F9' }}>
                                <input 
                                    type="checkbox" 
                                    id="is_temporary"
                                    checked={newUser.is_temporary || false} 
                                    onChange={e => setNewUser({...newUser, is_temporary: e.target.checked})}
                                    style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#0891B2' }}
                                />
                                <label htmlFor="is_temporary" style={{ fontSize: '0.85rem', fontWeight: '800', color: '#1E293B', cursor: 'pointer' }}>Personal Temporal</label>
                            </div>

                            <button 
                                onClick={registerUser} 
                                style={{ 
                                    marginTop: '1rem', padding:'1.1rem', borderRadius:'18px', border: 'none', 
                                    backgroundColor:'#0891B2', color:'white', fontWeight:'900', cursor: 'pointer',
                                    boxShadow: '0 10px 15px -3px rgba(8, 145, 178, 0.3)', fontSize: '1rem'
                                }}
                            >
                                {saving ? '⏳ Registrando...' : '🚀 COMPLETAR REGISTRO'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes pulse {
                    0%, 100% { background-color: #F8FAFC; }
                    50% { background-color: #F1F5F9; }
                }
            `}</style>
        </div>
    );
}

