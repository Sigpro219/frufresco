'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import * as XLSX from 'xlsx';

interface Profile {
    id: string;
    contact_name: string;
    phone: string;
    role: string;
    email?: string;
    is_active: boolean;
    created_at: string;
    address?: string;
    specialty?: string;
    avatar_url?: string;
}

const ROLES = [
    { value: 'administrativo', label: 'Administrativo', color: '#64748B' },
    { value: 'web_admin', label: 'Administrador Web', color: '#3B82F6' },
    { value: 'comercial', label: 'Comercial', color: '#8B5CF6' },
    { value: 'sys_admin', label: 'Administrador del Sistema', color: '#1E293B' },
    { value: 'contabilidad', label: 'Contabilidad', color: '#0EA5E9' },
    { value: 'driver', label: 'Conductor', color: '#10B981' },
    { value: 'comprador', label: 'Comprador', color: '#F59E0B' },
    { value: 'internal_transport', label: 'Transporte Interno', color: '#D946EF' },
    { value: 'warehouse_aux', label: 'Auxiliar de Bodega', color: '#475569' }
];

const SPECIALTIES = [
    'Sede Administrativa',
    'Bodega'
];

export default function HRManagement() {
    const [users, setUsers] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [editingUser, setEditingUser] = useState<Profile | null>(null);
    const [sortBy, setSortBy] = useState<'name' | 'role' | 'specialty'>('name');
    const [showAdd, setShowAdd] = useState(false);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [newUser, setNewUser] = useState<Partial<Profile>>({
        contact_name: '',
        email: '',
        phone: '',
        role: 'warehouse_aux',
        specialty: 'Bodega',
        is_active: true
    });

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setUsers(data || []);
        } catch (err) {
            console.error('Error:', err);
        } finally {
            setLoading(false);
        }
    };

    const [saving, setSaving] = useState(false);

    const updateProfile = async (userId: string, updates: Partial<Profile>) => {
        try {
            setSaving(true);
            // Clean updates: only send editable fields
            const cleanedUpdates: Record<string, any> = {};
            const fieldsToKeep = ['contact_name', 'phone', 'role', 'email', 'is_active', 'address', 'specialty', 'avatar_url'];
            
            fieldsToKeep.forEach(field => {
                if (field in updates) {
                    cleanedUpdates[field] = (updates as Record<string, any>)[field];
                }
            });

            const { error } = await supabase
                .from('profiles')
                .update(cleanedUpdates)
                .eq('id', userId);

            if (error) throw error;
            
            // Success! Refresh local and server state
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...cleanedUpdates } : u));
            if (editingUser?.id === userId) setEditingUser(null); 
            
            alert('¡Cambios guardados con éxito!');
            await fetchUsers(); // Force refresh from DB
        } catch (err: any) {
            console.error('Update Error:', err);
            alert(`Error al actualizar: ${err?.message || 'Error desconocido'}`);
        } finally {
            setSaving(false);
        }
    };

    const registerUser = async () => {
        if (!newUser.contact_name || !newUser.email) {
            alert('Por favor indica al menos nombre y email.');
            return;
        }
        try {
            // Creating a new profile. 
            const { data, error } = await supabase
                .from('profiles')
                .insert([{
                    ...newUser,
                    id: crypto.randomUUID(), // Provisionary ID until auth link
                    is_active: true
                }])
                .select()
                .single();

            if (error) throw error;
            setUsers([data, ...users]);
            setShowAdd(false);
            setNewUser({ contact_name: '', email: '', phone: '', role: 'warehouse_aux', specialty: 'Bodega', is_active: true });
            alert('¡Colaborador registrado exitosamente! Recuerda invitarlo por email desde Supabase Auth.');
        } catch (err: any) {
            alert(`Error al registrar: ${err.message}`);
        }
    };

    const deleteProfile = async (userId: string) => {
        if (!confirm('¿Estás seguro de eliminar PERMANENTEMENTE este perfil?')) return;
        try {
            const { error } = await supabase
                .from('profiles')
                .delete()
                .eq('id', userId);

            if (error) throw error;
            setUsers(users.filter(u => u.id !== userId));
        } catch (err) {
            alert('Error al eliminar. Nota: No puedes borrar usuarios que ya tengan pedidos o rutas asignadas.');
        }
    };

    const clearLibrary = async () => {
        const confirmMsg = '⚠️ ¿ESTÁS SEGURO?\n\nEsta acción eliminará TODOS los colaboradores actuales (excepto administradores y clientes B2B).\n\nLos perfiles que tengan órdenes o rutas asignadas NO podrán ser eliminados.';
        if (!confirm(confirmMsg)) return;
        
        try {
            setLoading(true);
            // Using multiple .not filters is safer for PostgREST syntax compatibility in some environments
            const { error } = await supabase
                .from('profiles')
                .delete()
                .not('role', 'eq', 'web_admin')
                .not('role', 'eq', 'b2b_client');

            if (error) throw error;
            
            alert('Proceso de limpieza finalizado. Se han eliminado los colaboradores permitidos.');
            await fetchUsers();
        } catch (err: unknown) {
            console.error('Error clearing library:', err);
            const message = (err as { message?: string })?.message || 'Error desconocido';
            alert(`Error al limpiar biblioteca: ${message}`);
        } finally {
            setLoading(false);
        }
    };

    const downloadTemplate = () => {
        const template = [
            {
                'Nombre Completo': 'Ej: Juan Pérez',
                'Email': 'juan.perez@frubana.com',
                'Teléfono': '3001234567',
                'Rol': 'driver',
                'Ubicación': 'Sede Administrativa'
            }
        ];

        const ws = XLSX.utils.json_to_sheet(template);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Colaboradores');

        // Add a sheet with roles for reference
        const refWs = XLSX.utils.json_to_sheet(ROLES.map(r => ({ 'ID de Rol': r.value, 'Nombre de Rol': r.label })));
        XLSX.utils.book_append_sheet(wb, refWs, 'Roles Disponibles');

        XLSX.writeFile(wb, 'Plantilla_Colaboradores_Frubana.xlsx');
    };

    const handleBulkUploadExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                if (jsonData.length === 0) {
                    alert('El archivo está vacío.');
                    return;
                }

                const newProfiles = jsonData.map((row: any) => {
                    const rawRole = (row['Rol'] || 'warehouse_aux').toString().trim();
                    
                    // Try to map label to value if explicit value not found
                    let finalRole = rawRole;
                    const matchedRole = ROLES.find(r => 
                        r.value.toLowerCase() === rawRole.toLowerCase() || 
                        r.label.toLowerCase() === rawRole.toLowerCase()
                    );
                    
                    if (matchedRole) {
                        finalRole = matchedRole.value;
                    }

                    return {
                        id: crypto.randomUUID(),
                        contact_name: row['Nombre Completo'] || row['Nombre'],
                        email: row['Email'] || row['Correo'],
                        phone: String(row['Teléfono'] || row['Celular'] || ''),
                        role: finalRole,
                        specialty: row['Ubicación'] || row['Sede'] || 'Bodega',
                        is_active: true
                    };
                }).filter(p => p.contact_name && p.email);

                if (newProfiles.length === 0) {
                    alert('No se encontraron datos válidos. Asegúrate de incluir Nombre y Email.');
                    return;
                }

                if (confirm(`¿Proceder con la carga de ${newProfiles.length} colaboradores?`)) {
                    const { error } = await supabase.from('profiles').insert(newProfiles);
                    if (error) throw error;
                    alert('¡Carga masiva completada con éxito!');
                    setShowBulkModal(false);
                    await fetchUsers();
                }
            } catch (err: unknown) {
                console.error('Bulk Upload Error:', err);
                const message = (err as { message?: string })?.message || 'Error al procesar Excel';
                alert(`Error en carga masiva: ${message}`);
            } finally {
                setUploading(false);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const sortedUsers = [...users].filter(u => {
        const matchesSearch = (u.contact_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                             (u.phone?.toLowerCase() || '').includes(searchTerm.toLowerCase());
        const matchesRole = filterRole === 'all' ? (u.role !== 'b2b_client') : (u.role === filterRole);
        return matchesSearch && matchesRole;
    }).sort((a, b) => {
        if (sortBy === 'name') {
            return (a.contact_name || '').localeCompare(b.contact_name || '');
        }
        if (sortBy === 'role') {
            const priority: Record<string, number> = {
                'web_admin': 1,
                'sys_admin': 2,
                'administrativo': 3,
                'contabilidad': 4,
                'comercial': 5,
                'driver': 6,
                'warehouse_aux': 7
            };
            const aPrio = priority[a.role] || 99;
            const bPrio = priority[b.role] || 99;
            return aPrio - bPrio;
        }
        if (sortBy === 'specialty') {
            const aSpec = a.specialty || '';
            const bSpec = b.specialty || '';
            if (aSpec === 'Sede Administrativa' && bSpec !== 'Sede Administrativa') return -1;
            if (aSpec !== 'Sede Administrativa' && bSpec === 'Sede Administrativa') return 1;
            return aSpec.localeCompare(bSpec);
        }
        return 0;
    });

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F9FAFB' }}>
            <Navbar />
            
            <div className="container" style={{ padding: '2rem 1rem' }}>
                <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#111827', margin: 0 }}>Gestión de <span style={{ color: '#0891B2' }}>Talento</span></h1>
                        <p style={{ color: '#6B7280', fontSize: '1.1rem' }}>Control total de perfiles, roles y accesos al ecosistema.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button 
                            onClick={clearLibrary}
                            style={{ 
                                padding: '0.8rem 1.5rem', borderRadius: '14px', 
                                backgroundColor: '#FEE2E2', color: '#991B1B',
                                border: '1px solid #FECACA', fontWeight: '800', cursor: 'pointer'
                            }}
                        >
                            🗑️ Limpiar Biblioteca
                        </button>
                        <button 
                            onClick={() => setShowBulkModal(true)}
                            style={{ 
                                padding: '0.8rem 1.5rem', borderRadius: '14px', 
                                backgroundColor: '#F3F4F6', color: '#374151',
                                border: '1px solid #D1D5DB', fontWeight: '800', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '8px'
                            }}
                        >
                            📤 Carga Masiva (Excel)
                        </button>
                        <button 
                            onClick={() => setShowAdd(true)}
                            style={{ 
                                padding: '0.8rem 1.5rem', borderRadius: '14px', 
                                backgroundColor: '#0891B2', color: 'white',
                                border: 'none', fontWeight: '800', cursor: 'pointer',
                                boxShadow: '0 4px 14px rgba(8, 145, 178, 0.3)'
                            }}
                        >
                            + Registrar Colaborador
                        </button>
                    </div>
                </header>

                {/* FILTERS */}
                <div style={{ 
                    backgroundColor: 'white', padding: '1.5rem', borderRadius: '24px', 
                    border: '1px solid #E5E7EB', marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap'
                }}>
                    <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }}>🔍</span>
                        <input 
                            placeholder="Buscar por nombre o celular..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ width: '100%', padding: '0.8rem 1rem 0.8rem 2.5rem', borderRadius: '14px', border: '1px solid #D1D5DB', fontSize: '0.9rem' }}
                        />
                    </div>
                    <select 
                        value={filterRole}
                        onChange={e => setFilterRole(e.target.value)}
                        style={{ padding: '0.8rem 1rem', borderRadius: '14px', border: '1px solid #D1D5DB', backgroundColor: 'white', fontWeight: '600', minWidth: '180px' }}
                    >
                        <option value="all">Todos los Roles</option>
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>

                    <select 
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as 'name' | 'role' | 'specialty')}
                        style={{ padding: '0.8rem 1rem', borderRadius: '14px', border: '1px solid #D1D5DB', backgroundColor: '#F3F4F6', fontWeight: '800', minWidth: '180px' }}
                    >
                        <option value="name">🔤 Ordenar por Nombre</option>
                        <option value="role">👔 Ordenar por Cargo</option>
                        <option value="specialty">📍 Ordenar por Ubicación</option>
                    </select>
                </div>

                {/* USERS TABLE */}
                <div style={{ backgroundColor: 'white', borderRadius: '24px', border: '1px solid #E5E7EB', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#F9FAFB', textAlign: 'left', borderBottom: '2px solid #F3F4F6' }}>
                                <th style={{ padding: '1.2rem', fontSize: '0.75rem', fontWeight: '900', color: '#6B7280', textTransform: 'uppercase' }}>Colaborador</th>
                                <th style={{ padding: '1.2rem', fontSize: '0.75rem', fontWeight: '900', color: '#6B7280', textTransform: 'uppercase' }}>Rol y Estado</th>
                                <th style={{ padding: '1.2rem', fontSize: '0.75rem', fontWeight: '900', color: '#6B7280', textTransform: 'uppercase' }}>Contacto</th>
                                <th style={{ padding: '1.2rem', fontSize: '0.75rem', fontWeight: '900', color: '#6B7280', textTransform: 'uppercase' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedUsers.map((user: Profile) => {
                                const roleInfo = ROLES.find(r => r.value === user.role) || { label: user.role, color: '#6B7280' };
                                return (
                                    <tr key={user.id} style={{ borderBottom: '1px solid #F3F4F6', transition: 'background 0.2s', opacity: user.is_active ? 1 : 0.6 }}>
                                        <td style={{ padding: '1.2rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                <div style={{ 
                                                    width: '45px', height: '45px', borderRadius: '50%', 
                                                    backgroundColor: user.avatar_url ? 'transparent' : '#F3F4F6', 
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                                    fontSize: '1rem', fontWeight: '900', color: '#6B7280',
                                                    overflow: 'hidden', border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                                }}>
                                                    {user.avatar_url ? (
                                                        <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : (
                                                        user.contact_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || '?'
                                                    )}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: '800', color: '#111827' }}>{user.contact_name || 'Sin Nombre'}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>{user.specialty || 'Sin ubicación'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.2rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                <span style={{ 
                                                    padding: '0.3rem 0.6rem', borderRadius: '8px', fontSize: '0.65rem', fontWeight: '900', alignSelf: 'flex-start',
                                                    backgroundColor: `${roleInfo.color}15`, color: roleInfo.color, border: `1px solid ${roleInfo.color}30`
                                                }}>
                                                    {roleInfo.label.toUpperCase()}
                                                </span>
                                                <span style={{ fontSize: '0.7rem', color: user.is_active ? '#10B981' : '#EF4444', fontWeight: '700' }}>
                                                    ● {user.is_active ? 'ACTIVO' : 'ARCHIVADO'}
                                                </span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.2rem' }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#111827' }}>{user.phone || 'Sin teléfono'}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#0891B2', fontWeight: '600' }}>{user.email || 'Sin email'}</div>
                                        </td>
                                        <td style={{ padding: '1.2rem' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button 
                                                    onClick={() => setEditingUser(user)}
                                                    style={{ padding: '0.5rem 0.8rem', borderRadius: '10px', backgroundColor: '#F3F4F6', border: '1px solid #E5E7EB', fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer' }}
                                                >
                                                    Editar
                                                </button>
                                                <button 
                                                    onClick={() => updateProfile(user.id, { is_active: !user.is_active })}
                                                    style={{ 
                                                        padding: '0.5rem 0.8rem', borderRadius: '10px', 
                                                        backgroundColor: user.is_active ? '#FEE2E2' : '#D1FAE5', 
                                                        color: user.is_active ? '#991B1B' : '#065F46',
                                                        border: 'none', fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer' 
                                                    }}
                                                >
                                                    {user.is_active ? 'Archivar' : 'Reactivar'}
                                                </button>
                                                <button 
                                                    onClick={() => deleteProfile(user.id)}
                                                    style={{ 
                                                        padding: '0.5rem 0.8rem', borderRadius: '10px', 
                                                        backgroundColor: 'transparent', color: '#991B1B',
                                                        border: '1px solid #FEE2E2', fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer' 
                                                    }}
                                                >
                                                    Eliminar
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {sortedUsers.length === 0 && !loading && (
                        <div style={{ padding: '4rem', textAlign: 'center', color: '#9CA3AF' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👻</div>
                            <p style={{ fontWeight: '700' }}>No se encontraron colaboradores.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* DETAIL / EDIT MODAL */}
            {editingUser && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '32px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', padding: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '900' }}>Perfil de <span style={{ color: '#0891B2' }}>Colaborador</span></h2>
                            <button onClick={() => setEditingUser(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', marginBottom: '0.5rem', color: '#6B7280' }}>NOMBRE COMPLETO</label>
                                <input 
                                    value={editingUser.contact_name || ''}
                                    onChange={(e) => setEditingUser({...editingUser, contact_name: e.target.value})}
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB' }}
                                />
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', marginBottom: '0.5rem', color: '#6B7280' }}>ROL DEL SISTEMA</label>
                                <select 
                                    value={editingUser.role}
                                    onChange={(e) => setEditingUser({...editingUser, role: e.target.value})}
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB', backgroundColor: 'white', fontWeight: '700' }}
                                >
                                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', marginBottom: '0.5rem', color: '#6B7280' }}>TELÉFONO / WHATSAPP</label>
                                <input 
                                    value={editingUser.phone || ''}
                                    onChange={(e) => setEditingUser({...editingUser, phone: e.target.value})}
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB' }}
                                />
                            </div>

                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', marginBottom: '0.5rem', color: '#6B7280' }}>CORREO ELECTRÓNICO (Para Accesos)</label>
                                <input 
                                    type="email"
                                    placeholder="ejemplo@frubana.com"
                                    value={editingUser.email || ''}
                                    onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', marginBottom: '0.5rem', color: '#6B7280' }}>ESPECIALIDAD / UBICACIÓN</label>
                                <select 
                                    value={editingUser.specialty || ''}
                                    onChange={(e) => setEditingUser({...editingUser, specialty: e.target.value})}
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB', backgroundColor: 'white', fontWeight: '600' }}
                                >
                                    <option value="">Seleccionar Ubicación...</option>
                                    {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                <button 
                                    disabled={saving}
                                    onClick={() => updateProfile(editingUser.id, editingUser)}
                                    style={{ 
                                        width: '100%', padding: '0.8rem', borderRadius: '12px', 
                                        backgroundColor: saving ? '#9CA3AF' : '#0891B2', 
                                        color: 'white', border: 'none', fontWeight: '800', 
                                        cursor: saving ? 'not-allowed' : 'pointer' 
                                    }}
                                >
                                    {saving ? 'GUARDANDO...' : 'GUARDAR CAMBIOS'}
                                </button>
                            </div>
                        </div>

                        <div style={{ marginTop: '2rem', padding: '1.5rem', backgroundColor: '#FEF2F2', borderRadius: '20px', border: '1px solid #FEE2E2' }}>
                            <h4 style={{ margin: '0 0 0.5rem 0', color: '#991B1B', fontSize: '0.9rem' }}>Zona Administrativa</h4>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#991B1B', opacity: 0.8 }}>
                                Las contraseñas se gestionan directamente vía email de recuperación o en el panel Auth de Supabase para máxima seguridad.
                            </p>
                        </div>
                    </div>
                </div>
            )}
            {/* REGISTRATION MODAL */}
            {showAdd && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '32px', width: '100%', maxWidth: '500px', padding: '2rem' }}>
                        <h2 style={{ marginBottom: '1.5rem', fontWeight: '900' }}>Nuevo <span style={{ color: '#0891B2' }}>Colaborador</span></h2>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <input 
                                placeholder="Nombre completo"
                                value={newUser.contact_name}
                                onChange={e => setNewUser({...newUser, contact_name: e.target.value})}
                                style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB' }}
                            />
                            <input 
                                placeholder="Email organizacional"
                                value={newUser.email || ''}
                                onChange={e => setNewUser({...newUser, email: e.target.value})}
                                style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB' }}
                            />
                            <input 
                                placeholder="Teléfono"
                                value={newUser.phone}
                                onChange={e => setNewUser({...newUser, phone: e.target.value})}
                                style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB' }}
                            />
                            <select 
                                value={newUser.role}
                                onChange={e => setNewUser({...newUser, role: e.target.value})}
                                style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB' }}
                            >
                                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                            <select 
                                value={newUser.specialty}
                                onChange={e => setNewUser({...newUser, specialty: e.target.value})}
                                style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB' }}
                            >
                                {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB', backgroundColor: 'transparent' }}>Cancelar</button>
                                <button onClick={registerUser} style={{ flex: 2, padding: '0.8rem', borderRadius: '12px', border: 'none', backgroundColor: '#0891B2', color: 'white', fontWeight: '800' }}>GUARDAR</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* BULK UPLOAD MODAL */}
            {showBulkModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, backdropFilter: 'blur(4px)' }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '24px', width: '100%', maxWidth: '450px', padding: '2rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📈</div>
                        <h2 style={{ marginBottom: '0.5rem', fontWeight: '900' }}>Carga Masiva</h2>
                        <p style={{ color: '#6B7280', fontSize: '0.9rem', marginBottom: '2rem' }}>
                            Actualiza tu base de colaboradores rápidamente usando nuestro formato de Excel.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <button 
                                onClick={downloadTemplate}
                                style={{ 
                                    padding: '1rem', borderRadius: '12px', border: '2px dashed #0891B2', 
                                    color: '#0891B2', backgroundColor: '#ECFEFF', fontWeight: '700', cursor: 'pointer' 
                                }}
                            >
                                ⬇️ Descargar Plantilla .xlsx
                            </button>

                            <label style={{ 
                                padding: '1rem', borderRadius: '12px', backgroundColor: '#0891B2', 
                                color: 'white', fontWeight: '800', cursor: uploading ? 'not-allowed' : 'pointer' 
                            }}>
                                {uploading ? 'PROCESANDO...' : '📂 Seleccionar Archivo y Subir'}
                                <input 
                                    type="file" 
                                    accept=".xlsx, .xls" 
                                    onChange={handleBulkUploadExcel} 
                                    style={{ display: 'none' }} 
                                    disabled={uploading}
                                />
                            </label>

                            <button 
                                onClick={() => setShowBulkModal(false)}
                                style={{ background: 'none', border: 'none', color: '#6B7280', fontWeight: '600', cursor: 'pointer', marginTop: '1rem' }}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
