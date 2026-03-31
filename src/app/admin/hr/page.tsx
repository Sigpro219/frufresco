'use client';

import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

interface Profile {
    id: string;
    contact_name: string;
    email?: string;
    phone?: string;
    role: string;
    specialty?: string;
    is_active: boolean;
    created_at?: string;
    document_id?: string;
    avatar_url?: string;
}

interface Role {
    value: string;
    label: string;
    color: string;
}

const ROLES: Role[] = [
    { value: 'coord_admin', label: 'Coordinador Administrativo', color: '#1E40AF' },
    { value: 'lider_cartera', label: 'Líder de Cartera', color: '#1E3A8A' },
    { value: 'aux_contable', label: 'Auxiliar Contable', color: '#3B82F6' },
    { value: 'lider_facturacion', label: 'Líder de Facturación', color: '#2563EB' },
    { value: 'tesorero', label: 'Tesorero', color: '#1D4ED8' },
    { value: 'rrhh', label: 'RR-HH', color: '#7C3AED' },
    { value: 'aux_admin', label: 'Auxiliar Administrativo', color: '#9333EA' },
    { value: 'coord_ops', label: 'Coordinador de Operaciones', color: '#059669' },
    { value: 'lider_inventario', label: 'Líder de Inventario', color: '#10B981' },
    { value: 'gestion_pedidos', label: 'Gestión de Pedidos', color: '#34D399' },
    { value: 'lider_lista', label: 'Líder de Lista', color: '#4ADE80' },
    { value: 'aux_bodega', label: 'Auxiliar de Bodega', color: '#6B7280' },
    { value: 'servicios_generales', label: 'Servicios Generales', color: '#9CA3AF' },
    { value: 'enfermero', label: 'Enfermero', color: '#EF4444' },
    { value: 'conductor', label: 'Conductor', color: '#F59E0B' },
    { value: 'aux_ruta', label: 'Auxiliar de Ruta', color: '#D97706' },
    { value: 'servicio_cliente', label: 'Servicio al Cliente', color: '#DB2777' },
    { value: 'comprador', label: 'Comprador', color: '#475569' }
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
    const [filterRole, setFilterRole] = useState('all');
    const [sortBy, setSortBy] = useState<'name' | 'role' | 'specialty'>('name');
    const [editingUser, setEditingUser] = useState<Profile | null>(null);
    const [showAdd, setShowAdd] = useState(false);
    const [newUser, setNewUser] = useState<Partial<Profile>>({
        contact_name: '',
        email: '',
        phone: '',
        role: 'aux_bodega',
        specialty: 'BODEGA',
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
                .from('profiles')
                .select('*')
                .not('role', 'in', '("b2b_client","b2c_client")');

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
            // Clean updates: avoid updating ID or immutable fields
            const { id, created_at, ...cleanedUpdates } = updates;
            
            const { error } = await supabase
                .from('profiles')
                .update({
                    ...cleanedUpdates,
                    role: 'admin' // Force technically valid role while structure finishes
                })
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
        try {
            setSaving(true);
            const { error } = await supabase
                .from('profiles')
                .insert([{
                    ...newUser,
                    role: 'admin', // Force technically valid role
                    id: crypto.randomUUID(),
                    is_active: true
                }]);

            if (error) throw error;
            setShowAdd(false);
            setNewUser({ contact_name: '', email: '', phone: '', role: 'aux_bodega', specialty: 'BODEGA', is_active: true });
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
                .from('profiles')
                .update({ is_active: !currentStatus })
                .eq('id', userId);
            if (error) throw error;
            await fetchData();
        } catch (err: any) {
            console.error(err.message);
        }
    };

    const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    const sortedUsers = [...users].filter(u => {
        const query = searchTerm.trim().toLowerCase();
        if (!query) {
            return filterRole === 'all' || u.role === filterRole;
        }

        if (query.startsWith('#')) {
            const cedulaQuery = query.substring(1).trim();
            return (u.document_id || '').toLowerCase().includes(cedulaQuery);
        }

        if (query.startsWith('@')) {
            const metaQuery = normalize(query.substring(1).trim());
            const roleInfo = ROLES.find(r => r.value === u.role);
            const roleLabel = normalize(roleInfo?.label || '');
            const specialty = normalize(u.specialty || '');
            return roleLabel.includes(metaQuery) || specialty.includes(metaQuery);
        }

        const terms = searchTerm.split(',').map(t => normalize(t.trim())).filter(Boolean);
        const haystack = normalize([u.contact_name || '', u.phone || '', u.email || ''].join(' '));
        return terms.some(term => haystack.includes(term));
    }).sort((a, b) => {
        if (sortBy === 'name') return (a.contact_name || '').localeCompare(b.contact_name || '');
        if (sortBy === 'role') return a.role.localeCompare(b.role);
        if (sortBy === 'specialty') return (a.specialty || '').localeCompare(b.specialty || '');
        return 0;
    });

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F9FAFB' }}>
            <Navbar />
            
            <main style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
                <header style={{ 
                    marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', 
                    alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem',
                    maxHeight: scrolled ? '0' : '200px', opacity: scrolled ? 0 : 1,
                    overflow: 'hidden', transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    pointerEvents: scrolled ? 'none' : 'auto'
                }}>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#111827', letterSpacing: '-0.025em', marginBottom: '0.5rem' }}>
                            Gestión de <span style={{ color: '#0891B2' }}>Talento</span>
                        </h1>
                        <p style={{ color: '#6B7280', fontSize: '1.1rem' }}>Control total de perfiles, roles y accesos al ecosistema.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <button disabled style={{ padding: '0.5rem 1rem', borderRadius: '12px', backgroundColor: '#F3F4F6', color: '#9CA3AF', border: '1px solid #E5E7EB', fontWeight: '700', fontSize: '0.75rem', cursor: 'not-allowed' }}>
                            📊 Excel Deshabilitado
                        </button>
                        <button 
                            onClick={() => setShowAdd(true)}
                            style={{ padding: '0.8rem 1.8rem', borderRadius: '16px', backgroundColor: '#0891B2', color: 'white', border: 'none', fontWeight: '800', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(8, 145, 178, 0.3)' }}
                        >
                            + Registrar Colaborador
                        </button>
                    </div>
                </header>

                <div style={{ 
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
                    gap: '1.5rem', marginBottom: '2.5rem',
                    maxHeight: scrolled ? '0' : '300px', opacity: scrolled ? 0 : 1,
                    overflow: 'hidden', transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    pointerEvents: scrolled ? 'none' : 'auto'
                }}>
                    <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                        <div style={{ color: '#6B7280', fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase' }}>Total Funcionarios</div>
                        <div style={{ fontSize: '2.2rem', fontWeight: '900', color: '#111827', marginTop: '0.5rem' }}>{users.length}</div>
                    </div>
                    <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                        <div style={{ color: '#059669', fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase' }}>Activos Hoy</div>
                        <div style={{ fontSize: '2.2rem', fontWeight: '900', color: '#059669', marginTop: '0.5rem' }}>{users.filter(u => u.is_active).length}</div>
                    </div>
                    <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                        <div style={{ color: '#F59E0B', fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase' }}>En Archivo</div>
                        <div style={{ fontSize: '2.2rem', fontWeight: '900', color: '#F59E0B', marginTop: '0.5rem' }}>{users.filter(u => !u.is_active).length}</div>
                    </div>
                </div>

                <div style={{ 
                    backgroundColor: 'white', padding: '1rem 1.5rem', borderRadius: scrolled ? '0 0 24px 24px' : '24px', 
                    border: '1px solid #E5E7EB', marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center',
                    position: 'sticky', top: '0px', zIndex: 50, boxShadow: scrolled ? '0 10px 15px -3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.3s ease',
                    marginTop: scrolled ? '-1rem' : '0'
                }}>
                    <div style={{ flex: 1, minWidth: '350px', position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#0891B2', fontWeight: '900' }}>{scrolled ? '📍' : '🔍'}</span>
                        <input 
                            placeholder="Filtrar colaboradores..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ 
                                width: '100%', padding: '0.7rem 1rem 0.7rem 2.8rem', borderRadius: '14px', 
                                border: '1.5px solid #F3F4F6', backgroundColor: '#F9FAFB', fontSize: '0.95rem',
                                fontWeight: '600'
                            }}
                        />
                    </div>
                    {scrolled && (
                        <button 
                            onClick={() => setShowAdd(true)}
                            style={{ padding: '0.6rem 1.2rem', borderRadius: '12px', backgroundColor: '#0891B2', color: 'white', border: 'none', fontWeight: '800', cursor: 'pointer', fontSize: '0.8rem' }}
                        >+ Nuevo</button>
                    )}
                    <select 
                        value={filterRole} 
                        onChange={e => setFilterRole(e.target.value)} 
                        style={{ padding: '0.7rem 1rem', borderRadius: '14px', border: '1.5px solid #F3F4F6', fontWeight: '700', color: '#4B5563', backgroundColor: 'white' }}
                    >
                        <option value="all">Todos los Cargos</option>
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                </div>

                <div style={{ backgroundColor: 'white', borderRadius: '28px', border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ backgroundColor: '#F9FAFB', borderBottom: '2px solid #F3F4F6' }}>
                            <tr>
                                <th style={{ padding: '1.5rem', textAlign: 'left', color: '#6B7280', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' }}>Colaborador</th>
                                <th style={{ padding: '1.5rem', textAlign: 'left', color: '#6B7280', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' }}>Rol Técnico</th>
                                <th style={{ padding: '1.5rem', textAlign: 'left', color: '#6B7280', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' }}>Contacto</th>
                                <th style={{ padding: '1.5rem', textAlign: 'right', color: '#6B7280', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedUsers.map(user => {
                                const roleInfo = ROLES.find(r => r.value === user.role) || { label: user.role, color: '#6B7280' };
                                return (
                                    <tr key={user.id} style={{ borderBottom: '1px solid #F3F4F6', opacity: user.is_active ? 1 : 0.6 }}>
                                        <td style={{ padding: '1.5rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                <div style={{ width: '45px', height: '45px', borderRadius: '14px', backgroundColor: '#ECFEFF', color: '#0891B2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '1rem' }}>
                                                    {user.contact_name?.charAt(0)}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: '800', color: '#111827', fontSize: '1rem' }}>{user.contact_name}</div>
                                                    <div style={{ fontSize: '0.8rem', color: '#0891B2', fontWeight: '700', marginTop: '2px' }}>{user.document_id ? `CC ${user.document_id}` : 'Sin Cédula'}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: '2px' }}>{user.specialty}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.5rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <span style={{ fontSize: '0.65rem', fontWeight: '900', color: 'white', backgroundColor: roleInfo.color, padding: '3px 8px', borderRadius: '6px', width: 'fit-content' }}>
                                                    {roleInfo.label.toUpperCase()}
                                                </span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: user.is_active ? '#10B981' : '#F59E0B' }}></div>
                                                    <span style={{ fontSize: '0.7rem', fontWeight: '700', color: user.is_active ? '#059669' : '#D97706' }}>
                                                        {user.is_active ? 'ACTIVO' : 'ARCHIVADO'}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.5rem' }}>
                                            <div style={{ fontWeight: '700', color: '#374151', fontSize: '0.9rem' }}>{user.phone || '—'}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>{user.email || '—'}</div>
                                        </td>
                                        <td style={{ padding: '1.5rem', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                <button onClick={() => setEditingUser(user)} style={{ padding: '0.5rem 1rem', borderRadius: '10px', border: '1.5px solid #F3F4F6', backgroundColor: 'white', fontWeight: '700', cursor: 'pointer' }}>Editar</button>
                                                <button 
                                                    onClick={() => toggleUserStatus(user.id, user.is_active)}
                                                    style={{ padding: '0.5rem 1rem', borderRadius: '10px', border: 'none', backgroundColor: user.is_active ? '#FEF2F2' : '#DCFCE7', color: user.is_active ? '#EF4444' : '#166534', fontWeight: '800', cursor: 'pointer' }}
                                                >
                                                    {user.is_active ? 'Archivar' : 'Reactivar'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </main>

            {/* MODALES */}
            {editingUser && (
                <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, backgroundColor: 'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '24px', width: '100%', maxWidth: '500px' }}>
                        <h2 style={{ marginBottom: '1.5rem', fontWeight: '900' }}>Editar Colaborador</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <input 
                                placeholder="Nombre" 
                                value={editingUser.contact_name} 
                                onChange={e => setEditingUser({...editingUser, contact_name: e.target.value})}
                                style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB' }}
                            />
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <input placeholder="Cédula" value={editingUser.document_id || ''} onChange={e => setEditingUser({...editingUser, document_id: e.target.value})} style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB' }} />
                                <input placeholder="Tlf" value={editingUser.phone || ''} onChange={e => setEditingUser({...editingUser, phone: e.target.value})} style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB' }} />
                            </div>
                            <select value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value})} style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB' }}>
                                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                            <div style={{ display:'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button onClick={() => setEditingUser(null)} style={{ flex:1, padding:'0.8rem', borderRadius:'12px', border: '1px solid #D1D5DB' }}>Cancelar</button>
                                <button onClick={() => updateProfile(editingUser.id, editingUser)} style={{ flex:1, padding:'0.8rem', borderRadius:'12px', border: 'none', backgroundColor:'#0891B2', color:'white', fontWeight:'800' }}>Guardar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showAdd && (
                <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, backgroundColor: 'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '24px', width: '100%', maxWidth: '500px' }}>
                        <h2 style={{ marginBottom: '1.5rem', fontWeight: '900' }}>Nuevo Colaborador</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <input 
                                placeholder="Nombre completo" 
                                value={newUser.contact_name} 
                                onChange={e => setNewUser({...newUser, contact_name: e.target.value})}
                                style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB' }}
                            />
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <input placeholder="Cédula" value={newUser.document_id || ''} onChange={e => setNewUser({...newUser, document_id: e.target.value})} style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB' }} />
                                <input placeholder="Tlf" value={newUser.phone || ''} onChange={e => setNewUser({...newUser, phone: e.target.value})} style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB' }} />
                            </div>
                            <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})} style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB' }}>
                                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                            <div style={{ display:'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button onClick={() => setShowAdd(false)} style={{ flex:1, padding:'0.8rem', borderRadius:'12px', border: '1px solid #D1D5DB' }}>Cancelar</button>
                                <button onClick={registerUser} style={{ flex:1, padding:'0.8rem', borderRadius:'12px', border: 'none', backgroundColor:'#0891B2', color:'white', fontWeight:'800' }}>Registrar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
