'use client';

import React, { useState, useEffect } from 'react';
import { 
    UserCheck, UserX, ShieldAlert, Key, Share2, Check, Copy, Printer, QrCode, 
    Trash2, Lock, Unlock, RefreshCw, AlertTriangle, ExternalLink, HelpCircle, ShieldCheck
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { THEME } from '@/lib/adminTheme';
import { supabase } from '@/lib/supabase';
import PermissionTreeEditor from './PermissionTreeEditor';

interface PendingRequest {
    id: string;
    contact_name: string;
    role: string;
    specialty: string;
    phone: string;
    email: string;
    document_id: string;
    is_active: boolean;
    qr_token: string;
}

interface ActiveTechUser {
    profile_id: string;
    collaborator_id: string;
    contact_name: string;
    role: string;
    specialty: string;
    phone: string;
    email: string;
    document_id: string;
    is_active: boolean;
    profile_role: string;
    qr_token: string;
    created_at: string;
    custom_permissions?: string[];
}

export default function TechUserGovernance() {
    const [pending, setPending] = useState<PendingRequest[]>([]);
    const [activeUsers, setActiveUsers] = useState<ActiveTechUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Approval Dialog State
    const [approvingCol, setApprovingCol] = useState<PendingRequest | null>(null);
    const [inputEmail, setInputEmail] = useState('');
    const [inputPassword, setInputPassword] = useState('');
    const [showCredentialsModal, setShowCredentialsModal] = useState(false);
    const [createdCredentials, setCreatedCredentials] = useState<{
        name: string;
        email: string;
        password?: string;
        messageText: string;
        phone: string;
        qrToken: string;
    } | null>(null);

    // View QR / Details Dialog
    const [viewingUser, setViewingUser] = useState<ActiveTechUser | null>(null);

    // Reset Password State
    const [resettingUser, setResettingUser] = useState<ActiveTechUser | null>(null);
    const [inputResetPassword, setInputResetPassword] = useState('');

    // Custom Permissions State
    const [editingPermissionsUser, setEditingPermissionsUser] = useState<ActiveTechUser | null>(null);
    const [tempPermissions, setTempPermissions] = useState<string[]>([]);
    const [isSavingPermissions, setIsSavingPermissions] = useState(false);

    // Copy Alert State
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        fetchGovernanceData();
    }, []);

    useEffect(() => {
        const isModalOpen = !!(approvingCol || showCredentialsModal || viewingUser || resettingUser || editingPermissionsUser);
        if (isModalOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [approvingCol, showCredentialsModal, viewingUser, resettingUser, editingPermissionsUser]);

    const fetchGovernanceData = async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch('/api/provider/users');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al obtener datos');
            setPending(data.pending || []);
            setActiveUsers(data.active || []);
        } catch (err: any) {
            console.error('Error fetching governance:', err);
            setError(err.message || 'Error al conectar con la API de gobernanza');
        } finally {
            setLoading(false);
        }
    };

    const handleApproveClick = (col: PendingRequest) => {
        setApprovingCol(col);
        setInputEmail(col.email || '');
        setInputPassword('');
    };

    const handleConfirmApprove = async () => {
        if (!approvingCol) return;
        if (!inputEmail) {
            alert('El correo electrónico es obligatorio');
            return;
        }

        try {
            setActionLoading(approvingCol.id);
            setError(null);
            const res = await fetch('/api/provider/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'approve',
                    collaboratorId: approvingCol.id,
                    email: inputEmail,
                    password: inputPassword || undefined
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al aprobar');

            setCreatedCredentials({
                name: approvingCol.contact_name,
                email: data.email,
                password: data.password,
                messageText: data.messageText,
                phone: approvingCol.phone,
                qrToken: approvingCol.qr_token || approvingCol.id
            });

            setApprovingCol(null);
            setShowCredentialsModal(true);
            setSuccessMessage(`Acceso creado con éxito para ${approvingCol.contact_name}`);
            setTimeout(() => setSuccessMessage(null), 5000);
            await fetchGovernanceData();
        } catch (err: any) {
            alert(`Error al aprobar: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleConfirmResetPassword = async () => {
        if (!resettingUser) return;

        try {
            setActionLoading(resettingUser.profile_id);
            setError(null);
            const res = await fetch('/api/provider/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'reset-password',
                    collaboratorId: resettingUser.collaborator_id,
                    profileId: resettingUser.profile_id,
                    password: inputResetPassword || undefined
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al restablecer contraseña');

            setCreatedCredentials({
                name: resettingUser.contact_name,
                email: data.email,
                password: data.password,
                messageText: data.messageText,
                phone: resettingUser.phone,
                qrToken: resettingUser.qr_token || resettingUser.collaborator_id
            });

            setResettingUser(null);
            setShowCredentialsModal(true);
            setSuccessMessage(`Contraseña restablecida con éxito para ${resettingUser.contact_name}`);
            setTimeout(() => setSuccessMessage(null), 5000);
            await fetchGovernanceData();
        } catch (err: any) {
            alert(`Error al restablecer contraseña: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleToggleStatus = async (user: ActiveTechUser) => {
        const actionText = user.is_active ? 'suspender' : 'reactivar';
        if (!confirm(`¿Estás seguro de que deseas ${actionText} el acceso digital para ${user.contact_name}?`)) return;

        try {
            setActionLoading(user.profile_id);
            const res = await fetch('/api/provider/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'toggle-status',
                    collaboratorId: user.collaborator_id,
                    profileId: user.profile_id,
                    is_active: !user.is_active
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al cambiar estado');

            await fetchGovernanceData();
            setSuccessMessage(`Estado actualizado con éxito para ${user.contact_name}`);
            setTimeout(() => setSuccessMessage(null), 5000);
        } catch (err: any) {
            alert(`Error al cambiar estado: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDeleteUser = async (user: ActiveTechUser) => {
        if (!confirm(`⚠️ ALERTA CRÍTICA: ¿Estás seguro de que deseas REVOCAR Y ELIMINAR permanentemente la cuenta de ${user.contact_name}? Esta acción eliminará su login de Supabase Auth.`)) return;

        const confirmWord = 'ELIMINAR';
        const input = prompt(`Para confirmar la eliminación definitiva de la cuenta de ${user.contact_name}, escribe la palabra "${confirmWord}" en mayúsculas:`);
        if (input !== confirmWord) {
            alert('Confirmación incorrecta. Acción cancelada.');
            return;
        }

        try {
            setActionLoading(user.profile_id);
            const res = await fetch('/api/provider/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'delete',
                    collaboratorId: user.collaborator_id,
                    profileId: user.profile_id
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al eliminar');

            await fetchGovernanceData();
            setSuccessMessage(`Cuenta revocada con éxito para ${user.contact_name}`);
            setTimeout(() => setSuccessMessage(null), 5000);
        } catch (err: any) {
            alert(`Error al revocar cuenta: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleOpenPermissionsModal = (user: ActiveTechUser) => {
        setEditingPermissionsUser(user);
        setTempPermissions(user.custom_permissions || []);
    };

    const handleSavePermissions = async () => {
        if (!editingPermissionsUser) return;
        setIsSavingPermissions(true);
        try {
            const res = await fetch('/api/provider/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update-permissions',
                    profileId: editingPermissionsUser.profile_id,
                    permissions: tempPermissions
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al actualizar permisos');
            
            setSuccessMessage(`Permisos actualizados con éxito para ${editingPermissionsUser.contact_name}`);
            setTimeout(() => setSuccessMessage(null), 5000);
            setEditingPermissionsUser(null);
            await fetchGovernanceData();
        } catch (err: any) {
            alert(`Error al guardar permisos: ${err.message}`);
        } finally {
            setIsSavingPermissions(false);
        }
    };

    const handleCopyMessage = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const getWhatsAppLink = (phone: string, text: string) => {
        const cleanPhone = phone.replace(/\D/g, '');
        const formattedPhone = cleanPhone.startsWith('57') ? cleanPhone : `57${cleanPhone}`;
        return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', fontFamily: THEME.typography.fontFamilyMain }}>
            
            {/* Header Alert for Provider Context */}
            <div style={{ 
                backgroundColor: THEME.colors.primaryLight, 
                border: `1.5px solid ${THEME.colors.primary}`,
                borderRadius: '16px', 
                padding: '1.2rem 1.5rem', 
                display: 'flex', 
                alignItems: 'flex-start', 
                gap: '1rem' 
            }}>
                <ShieldCheck style={{ color: THEME.colors.primary, marginTop: '2px', flexShrink: 0 }} size={24} />
                <div>
                    <h4 style={{ margin: 0, color: THEME.colors.textMain, fontWeight: '800', fontSize: '1rem' }}>
                        Command Center: Control Nivel 3 (Tecnología & Gobernanza)
                    </h4>
                    <p style={{ margin: '0.4rem 0 0 0', color: THEME.colors.textSecondary, fontSize: '0.85rem', lineHeight: '1.4' }}>
                        Como proveedor de tecnología, controlas la activación, suspensión e invitaciones de credenciales de acceso.
                        Los gerentes de HR en <span style={{ fontWeight: '700' }}>Talento Humano</span> solo solicitan el acceso; la aprobación final, asignación de contraseñas y entrega del Onboarding digital se realiza desde este panel restringido.
                    </p>
                </div>
            </div>

            {successMessage && (
                <div style={{ 
                    backgroundColor: '#D1FAE5', 
                    color: '#065F46', 
                    border: '1px solid #A7F3D0', 
                    padding: '1rem', 
                    borderRadius: '12px', 
                    fontWeight: '700',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}>
                    <Check size={18} /> {successMessage}
                </div>
            )}

            {error && (
                <div style={{ 
                    backgroundColor: '#FEE2E2', 
                    color: '#991B1B', 
                    border: '1px solid #FCA5A5', 
                    padding: '1rem', 
                    borderRadius: '12px', 
                    fontWeight: '700',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}>
                    <AlertTriangle size={18} /> {error}
                </div>
            )}

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px', gap: '0.5rem' }}>
                    <RefreshCw size={20} className="animate-spin" style={{ color: THEME.colors.primary }} />
                    <span style={{ fontWeight: '700', color: THEME.colors.textSecondary }}>Cargando gobernanza de usuarios...</span>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    
                    {/* 1. PENDING REQUESTS PANEL */}
                    <section style={{ backgroundColor: 'white', borderRadius: '24px', padding: '2rem', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontWeight: '800', color: THEME.colors.textMain, fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Key size={20} style={{ color: '#F59E0B' }} /> Solicitudes Pendientes de Activación
                                    <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '12px', backgroundColor: '#FEF3C7', color: '#B45309', fontWeight: '900', marginLeft: '0.5rem' }}>
                                        {pending.length} por aprobar
                                    </span>
                                </h3>
                                <p style={{ margin: '0.3rem 0 0 0', color: THEME.colors.textSecondary, fontSize: '0.85rem' }}>
                                    Colaboradores registrados en el panel de HR con casilla "Solicitar Acceso Digital" marcada pero sin cuenta de login.
                                </p>
                            </div>
                            <button onClick={fetchGovernanceData} style={{ background: 'none', border: `1px solid ${THEME.colors.border}`, padding: '0.5rem 1rem', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: '700', color: THEME.colors.textSecondary }}>
                                <RefreshCw size={14} /> Refrescar
                            </button>
                        </div>

                        {pending.length === 0 ? (
                            <div style={{ padding: '3rem 1rem', textAlign: 'center', backgroundColor: THEME.colors.background, borderRadius: '16px', border: `1px dashed ${THEME.colors.border}` }}>
                                <UserCheck size={36} style={{ color: THEME.colors.textSecondary, opacity: 0.5, marginBottom: '0.8rem' }} />
                                <h4 style={{ margin: 0, color: THEME.colors.textMain, fontWeight: '700' }}>No hay solicitudes pendientes</h4>
                                <p style={{ margin: '0.3rem 0 0 0', color: THEME.colors.textSecondary, fontSize: '0.8rem' }}>
                                    Todos los colaboradores con acceso solicitado ya tienen una cuenta configurada.
                                </p>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto', borderRadius: '16px', border: `1px solid ${THEME.colors.border}` }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                                    <thead style={{ background: THEME.colors.background, borderBottom: `2px solid ${THEME.colors.border}` }}>
                                        <tr>
                                            <th style={{ padding: '1rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>COLABORADOR</th>
                                            <th style={{ padding: '1rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>SEDE / CARGO</th>
                                            <th style={{ padding: '1rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>DATOS DE CONTACTO</th>
                                            <th style={{ padding: '1rem', color: THEME.colors.textSecondary, fontWeight: '700', textAlign: 'right' }}>ACCIÓN DE CONTROL</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pending.map(col => (
                                            <tr key={col.id} style={{ borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                <td style={{ padding: '1rem' }}>
                                                    <div style={{ fontWeight: '800', color: THEME.colors.textMain }}>{col.contact_name}</div>
                                                    <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>Doc: {col.document_id || '---'}</div>
                                                </td>
                                                <td style={{ padding: '1rem' }}>
                                                    <div style={{ fontWeight: '700', color: THEME.colors.primary }}>{col.specialty || 'Sede principal'}</div>
                                                    <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, textTransform: 'uppercase', fontWeight: '800' }}>{col.role}</div>
                                                </td>
                                                <td style={{ padding: '1rem' }}>
                                                    <div style={{ fontWeight: '600', color: THEME.colors.textMain }}>{col.email || 'Sin correo asignado'}</div>
                                                    <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary }}>Celular: {col.phone || '---'}</div>
                                                </td>
                                                <td style={{ padding: '1rem', textAlign: 'right' }}>
                                                    <button 
                                                        onClick={() => handleApproveClick(col)}
                                                        disabled={actionLoading === col.id}
                                                        style={{ 
                                                            padding: '0.6rem 1.2rem', 
                                                            borderRadius: '10px', 
                                                            border: 'none', 
                                                            backgroundColor: THEME.colors.primary, 
                                                            color: 'white', 
                                                            fontWeight: '800', 
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '0.4rem',
                                                            boxShadow: '0 4px 6px -1px rgba(13, 122, 87, 0.2)',
                                                            transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        {actionLoading === col.id ? <RefreshCw size={14} className="animate-spin" /> : <UserCheck size={14} />}
                                                        Crear Credenciales
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    {/* 2. ACTIVE TECH USERS LIST */}
                    <section style={{ backgroundColor: 'white', borderRadius: '24px', padding: '2rem', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0, fontWeight: '800', color: THEME.colors.textMain, fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <UserCheck size={20} style={{ color: THEME.colors.primary }} /> Cuentas Digitales Activas (Gobernanza)
                                <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '12px', backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary, fontWeight: '900', marginLeft: '0.5rem' }}>
                                    {activeUsers.length} total
                                </span>
                            </h3>
                            <p style={{ margin: '0.3rem 0 0 0', color: THEME.colors.textSecondary, fontSize: '0.85rem' }}>
                                Cuentas con login activo en la aplicación. Puedes suspender de forma temporal su acceso (forzando logout inmediato) o revocar la cuenta de forma permanente.
                            </p>
                        </div>

                        {activeUsers.length === 0 ? (
                            <div style={{ padding: '3rem 1rem', textAlign: 'center', backgroundColor: THEME.colors.background, borderRadius: '16px', border: `1px dashed ${THEME.colors.border}` }}>
                                <UserX size={36} style={{ color: THEME.colors.textSecondary, opacity: 0.5, marginBottom: '0.8rem' }} />
                                <h4 style={{ margin: 0, color: THEME.colors.textMain, fontWeight: '700' }}>No hay cuentas creadas</h4>
                                <p style={{ margin: '0.3rem 0 0 0', color: THEME.colors.textSecondary, fontSize: '0.8rem' }}>
                                    Aún no has activado credenciales para ningún colaborador.
                                </p>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto', borderRadius: '16px', border: `1px solid ${THEME.colors.border}` }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                                    <thead style={{ background: THEME.colors.background, borderBottom: `2px solid ${THEME.colors.border}` }}>
                                        <tr>
                                            <th style={{ padding: '1rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>OPERARIO / COLABORADOR</th>
                                            <th style={{ padding: '1rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>LOGIN EMAIL</th>
                                            <th style={{ padding: '1rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>ESTADO ACCESO</th>
                                            <th style={{ padding: '1rem', color: THEME.colors.textSecondary, fontWeight: '700', textAlign: 'right' }}>ACCIONES DE SEGURIDAD</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activeUsers.map(user => (
                                            <tr key={user.profile_id} style={{ borderBottom: `1px solid ${THEME.colors.border}`, opacity: user.is_active ? 1 : 0.65 }}>
                                                <td style={{ padding: '1rem' }}>
                                                    <div style={{ fontWeight: '800', color: THEME.colors.textMain }}>{user.contact_name}</div>
                                                    <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>
                                                        {user.specialty} • <span style={{ textTransform: 'uppercase', color: THEME.colors.primary }}>{user.role}</span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '1rem' }}>
                                                    <div style={{ fontWeight: '600', color: THEME.colors.textMain }}>{user.email}</div>
                                                    <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary }}>Cel: {user.phone || '---'}</div>
                                                </td>
                                                <td style={{ padding: '1rem' }}>
                                                    <span style={{ 
                                                        padding: '0.25rem 0.6rem', 
                                                        borderRadius: '8px', 
                                                        fontSize: '0.65rem', 
                                                        fontWeight: '900',
                                                        backgroundColor: user.is_active ? '#DCFCE7' : '#FEE2E2',
                                                        color: user.is_active ? '#15803D' : '#B91C1C',
                                                        letterSpacing: '0.05em'
                                                    }}>
                                                        {user.is_active ? 'AUTORIZADO' : 'SUSPENDIDO'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '1rem', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                        <button 
                                                            onClick={() => handleOpenPermissionsModal(user)}
                                                            disabled={actionLoading === user.profile_id}
                                                            style={{ 
                                                                padding: '0.5rem 0.8rem', 
                                                                borderRadius: '8px', 
                                                                border: `1px solid ${THEME.colors.border}`, 
                                                                backgroundColor: 'white', 
                                                                color: THEME.colors.textSecondary,
                                                                fontWeight: '700',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '0.3rem',
                                                                fontSize: '0.75rem'
                                                            }}
                                                            title="Gestionar Permisos Personalizados (Árbol)"
                                                        >
                                                            <ShieldCheck size={14} style={{ color: THEME.colors.primary }} /> Permisos
                                                        </button>

                                                        <button 
                                                            onClick={() => setViewingUser(user)}
                                                            style={{ 
                                                                padding: '0.5rem 0.8rem', 
                                                                borderRadius: '8px', 
                                                                border: `1px solid ${THEME.colors.border}`, 
                                                                backgroundColor: 'white', 
                                                                color: THEME.colors.textSecondary,
                                                                fontWeight: '700',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '0.3rem',
                                                                fontSize: '0.75rem'
                                                            }}
                                                            title="Ver Código QR y Compartir Acceso"
                                                        >
                                                            <QrCode size={14} /> Compartir
                                                        </button>

                                                        <button 
                                                            onClick={() => {
                                                                setResettingUser(user);
                                                                setInputResetPassword('');
                                                            }}
                                                            style={{ 
                                                                padding: '0.5rem 0.8rem', 
                                                                borderRadius: '8px', 
                                                                border: `1px solid ${THEME.colors.border}`, 
                                                                backgroundColor: 'white', 
                                                                color: THEME.colors.textSecondary,
                                                                fontWeight: '700',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '0.3rem',
                                                                fontSize: '0.75rem'
                                                            }}
                                                            title="Restablecer Contraseña"
                                                        >
                                                            <Key size={14} style={{ color: '#F59E0B' }} /> Restablecer
                                                        </button>

                                                        <button 
                                                            onClick={() => handleToggleStatus(user)}
                                                            disabled={actionLoading === user.profile_id}
                                                            style={{ 
                                                                padding: '0.5rem 0.8rem', 
                                                                borderRadius: '8px', 
                                                                border: `1px solid ${user.is_active ? '#FCA5A5' : THEME.colors.primary}`, 
                                                                backgroundColor: 'transparent', 
                                                                color: user.is_active ? '#EF4444' : THEME.colors.primary,
                                                                fontWeight: '700',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '0.3rem',
                                                                fontSize: '0.75rem'
                                                            }}
                                                        >
                                                            {actionLoading === user.profile_id ? (
                                                                <RefreshCw size={14} className="animate-spin" />
                                                            ) : user.is_active ? (
                                                                <>
                                                                    <Lock size={13} /> Suspender
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Unlock size={13} /> Reactivar
                                                                </>
                                                            )}
                                                        </button>

                                                        <button 
                                                            onClick={() => handleDeleteUser(user)}
                                                            disabled={actionLoading === user.profile_id}
                                                            style={{ 
                                                                padding: '0.5rem', 
                                                                borderRadius: '8px', 
                                                                border: '1px solid #FCA5A5', 
                                                                backgroundColor: '#FEF2F2', 
                                                                color: '#EF4444',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center'
                                                            }}
                                                            title="Eliminar Cuenta Permanentemente"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </div>
            )}

            {/* MODAL 1: APROBAR Y CONFIGURAR EMAIL */}
            {approvingCol && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '2rem 1rem' }}>
                    <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '24px', border: `1px solid ${THEME.colors.border}`, width: '100%', maxWidth: '460px', boxShadow: THEME.shadow.lg }}>
                        <h3 style={{ margin: '0 0 1rem 0', fontWeight: '800', color: THEME.colors.textMain }}>Aprobar Acceso Digital</h3>
                        <p style={{ margin: '0 0 1.5rem 0', color: THEME.colors.textSecondary, fontSize: '0.85rem', lineHeight: '1.4' }}>
                            Configura el correo oficial de login para <span style={{ fontWeight: '700', color: THEME.colors.textMain }}>{approvingCol.contact_name}</span>. 
                            Si lo deseas, puedes asignar una contraseña o dejar que el sistema genere una robusta automáticamente.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>Correo de Login</label>
                                <input 
                                    type="email" 
                                    value={inputEmail} 
                                    onChange={e => setInputEmail(e.target.value)}
                                    placeholder="correo@frufresco.com"
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: `1.5px solid ${THEME.colors.border}`, fontWeight: '600', boxSizing: 'border-box', outline: 'none' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>Contraseña Personalizada (Opcional)</label>
                                <input 
                                    type="text" 
                                    value={inputPassword} 
                                    onChange={e => setInputPassword(e.target.value)}
                                    placeholder="Dejar en blanco para autogenerar"
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: `1.5px solid ${THEME.colors.border}`, fontWeight: '600', boxSizing: 'border-box', outline: 'none' }}
                                />
                                <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, display: 'block', marginTop: '0.3rem' }}>
                                    Debe tener al menos 6 caracteres.
                                </span>
                            </div>

                            <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1rem' }}>
                                <button 
                                    onClick={() => setApprovingCol(null)}
                                    style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: `1px solid ${THEME.colors.border}`, backgroundColor: 'white', color: THEME.colors.textSecondary, fontWeight: '800', cursor: 'pointer' }}
                                >
                                    Cancelar
                                </button>
                                <button 
                                    onClick={handleConfirmApprove}
                                    style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: 'none', backgroundColor: THEME.colors.primary, color: 'white', fontWeight: '800', cursor: 'pointer' }}
                                >
                                    Confirmar y Crear
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 2: CREDENCIALES CREADAS & ONBOARDING WHATSAPP */}
            {showCredentialsModal && createdCredentials && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '2rem 1rem' }}>
                    <div style={{ backgroundColor: 'white', padding: '2.5rem', borderRadius: '24px', border: `1px solid ${THEME.colors.border}`, width: '100%', maxWidth: '480px', boxShadow: THEME.shadow.lg }}>
                        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#D1FAE5', color: '#059669', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                                <Check size={28} />
                            </div>
                            <h3 style={{ margin: 0, fontWeight: '900', color: THEME.colors.textMain, fontSize: '1.4rem' }}>¡Acceso Digital Creado!</h3>
                            <p style={{ margin: '0.3rem 0 0 0', color: THEME.colors.textSecondary, fontSize: '0.85rem' }}>
                                Guarda las credenciales de onboarding para {createdCredentials.name}.
                            </p>
                        </div>

                        {/* Credentials Card */}
                        <div style={{ backgroundColor: THEME.colors.background, padding: '1.2rem', borderRadius: '16px', border: `1px solid ${THEME.colors.border}`, marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.85rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: THEME.colors.textSecondary, fontWeight: '700' }}>Usuario / Email:</span>
                                    <span style={{ color: THEME.colors.textMain, fontWeight: '800' }}>{createdCredentials.email}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: THEME.colors.textSecondary, fontWeight: '700' }}>Contraseña:</span>
                                    <span style={{ color: '#D97706', fontFamily: 'monospace', fontWeight: '900', fontSize: '0.95rem' }}>{createdCredentials.password}</span>
                                </div>
                            </div>
                        </div>

                        {/* WhatsApp Dispatch Template */}
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: THEME.colors.textSecondary, marginBottom: '0.5rem', textTransform: 'uppercase' }}>Onboarding Gratis (WhatsApp / SMS)</label>
                            <div style={{ 
                                border: '1px solid #D1D5DB', 
                                borderRadius: '12px', 
                                padding: '1rem', 
                                backgroundColor: '#F9FAFB', 
                                fontSize: '0.8rem', 
                                color: THEME.colors.textMain, 
                                whiteSpace: 'pre-wrap',
                                fontFamily: 'var(--font-inter), sans-serif',
                                lineHeight: '1.4'
                            }}>
                                {createdCredentials.messageText}
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                                <button 
                                    onClick={() => handleCopyMessage(createdCredentials.messageText)}
                                    style={{ 
                                        flex: 1, padding: '0.6rem', borderRadius: '8px', 
                                        border: `1px solid ${THEME.colors.border}`, 
                                        backgroundColor: 'white', color: THEME.colors.textSecondary, 
                                        fontWeight: '700', cursor: 'pointer', display: 'flex', 
                                        alignItems: 'center', justifyContent: 'center', gap: '0.3rem', fontSize: '0.75rem' 
                                    }}
                                >
                                    <Copy size={14} /> {copied ? 'Copiado' : 'Copiar Texto'}
                                </button>
                                
                                <a 
                                    href={getWhatsAppLink(createdCredentials.phone || '57', createdCredentials.messageText)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ 
                                        flex: 1.2, padding: '0.6rem', borderRadius: '8px', border: 'none', 
                                        backgroundColor: '#25D366', color: 'white', fontWeight: '800', 
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', 
                                        justifyContent: 'center', gap: '0.4rem', textDecoration: 'none', fontSize: '0.75rem' 
                                    }}
                                >
                                    <ExternalLink size={14} /> Enviar por WhatsApp
                                </a>
                            </div>
                        </div>

                        {/* Session QR Preview */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '1.5rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>Código QR de Sesión Reusable</span>
                            <div style={{ padding: '0.8rem', backgroundColor: 'white', borderRadius: '12px', border: `1px solid ${THEME.colors.border}` }}>
                                <QRCodeSVG value={createdCredentials.qrToken} size={110} level="H" />
                            </div>
                            <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, textAlign: 'center' }}>
                                Este código QR permite al operario iniciar sesión de forma instantánea escaneando con la cámara.
                            </span>
                        </div>

                        <button 
                            onClick={() => setShowCredentialsModal(false)}
                            style={{ 
                                marginTop: '1.5rem', width: '100%', padding: '0.9rem', borderRadius: '12px', 
                                border: 'none', backgroundColor: THEME.colors.textMain, color: 'white', 
                                fontWeight: '800', cursor: 'pointer', fontSize: '0.9rem' 
                            }}
                        >
                            Listo, Cerrar
                        </button>
                    </div>
                </div>
            )}

            {/* MODAL 3: VER DETALLES Y QR DE USUARIO ACTIVO */}
            {viewingUser && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '2rem 1rem' }}>
                    <div style={{ backgroundColor: 'white', padding: '2.5rem', borderRadius: '24px', border: `1px solid ${THEME.colors.border}`, width: '100%', maxWidth: '420px', boxShadow: THEME.shadow.lg }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0, fontWeight: '800', color: THEME.colors.textMain }}>Detalles de Acceso</h3>
                            <button 
                                onClick={() => setViewingUser(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center' }}
                            >
                                <Trash2 size={18} style={{ visibility: 'hidden' }} />
                                <span style={{ fontWeight: '800', fontSize: '1.1rem' }}>×</span>
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0.8rem', padding: '1.2rem', backgroundColor: THEME.colors.background, borderRadius: '16px', border: `1px solid ${THEME.colors.border}`, marginBottom: '1.5rem' }}>
                            <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: THEME.colors.textMain }}>{viewingUser.contact_name}</h4>
                            <span style={{ fontSize: '0.65rem', fontWeight: '900', color: THEME.colors.primary, backgroundColor: THEME.colors.primaryLight, padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                                {viewingUser.role}
                            </span>
                            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>
                                Email: {viewingUser.email}<br/>
                                Celular: {viewingUser.phone || '---'}
                            </div>

                            {/* QR Code */}
                            <div style={{ padding: '1rem', backgroundColor: 'white', borderRadius: '12px', border: `1px solid ${THEME.colors.border}`, marginTop: '0.5rem' }}>
                                <QRCodeSVG value={viewingUser.qr_token || viewingUser.collaborator_id} size={130} level="H" />
                            </div>
                        </div>

                        {/* Onboarding Dispatch template */}
                        {(() => {
                            const shareText = `Hola ${viewingUser.contact_name}! Recuerda tus credenciales de acceso digital a FruFresco:\n\nUsuario: ${viewingUser.email}\n\nIngresa aquí: http://localhost:3001/login`;
                            return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                    <a 
                                        href={getWhatsAppLink(viewingUser.phone || '57', shareText)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ 
                                            padding: '0.8rem', borderRadius: '12px', border: 'none', 
                                            backgroundColor: '#25D366', color: 'white', fontWeight: '800', 
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', 
                                            justifyContent: 'center', gap: '0.4rem', textDecoration: 'none', fontSize: '0.85rem' 
                                        }}
                                    >
                                        <ExternalLink size={16} /> Re-enviar Onboarding (WhatsApp)
                                    </a>
                                    <button 
                                        onClick={() => {
                                            const printWin = window.open('', '_blank', 'width=600,height=600');
                                            if (!printWin) return alert('Habilita ventanas emergentes.');
                                            const qrSvgHtml = document.querySelector('#print-label-area-governance svg')?.outerHTML || '';
                                            
                                            printWin.document.write(`
                                                <html>
                                                <head>
                                                    <title>Etiqueta QR - ${viewingUser.contact_name}</title>
                                                    <style>
                                                        body { display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif; margin: 0; }
                                                        .label { border: 2px dashed #94a3b8; padding: 20px; border-radius: 8px; text-align: center; }
                                                        .name { font-weight: bold; margin-bottom: 5px; text-transform: uppercase; }
                                                        .role { font-size: 0.8rem; color: #0d7a57; margin-bottom: 10px; }
                                                    </style>
                                                </head>
                                                <body>
                                                    <div class="label">
                                                        <div class="name">${viewingUser.contact_name}</div>
                                                        <div class="role">${viewingUser.role}</div>
                                                        <div>${qrSvgHtml}</div>
                                                    </div>
                                                    <script>window.onload = function() { window.print(); window.close(); }</script>
                                                </body>
                                                </html>
                                            `);
                                            printWin.document.close();
                                        }}
                                        style={{ 
                                            padding: '0.8rem', borderRadius: '12px', border: `1px solid ${THEME.colors.border}`, 
                                            backgroundColor: 'white', color: THEME.colors.textMain, fontWeight: '800', 
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.85rem'
                                        }}
                                    >
                                        <Printer size={16} /> Imprimir Etiqueta QR
                                    </button>
                                </div>
                            );
                        })()}

                        {/* Invisible area for printing */}
                        <div id="print-label-area-governance" style={{ display: 'none' }}>
                            <QRCodeSVG value={viewingUser.qr_token || viewingUser.collaborator_id} size={150} level="H" />
                        </div>

                        <button 
                            onClick={() => setViewingUser(null)}
                            style={{ 
                                marginTop: '1.5rem', width: '100%', padding: '0.8rem', borderRadius: '12px', 
                                border: 'none', backgroundColor: THEME.colors.textMain, color: 'white', 
                                fontWeight: '800', cursor: 'pointer', fontSize: '0.85rem' 
                            }}
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            )}

            {/* MODAL 4: RESTABLECER CONTRASEÑA */}
            {resettingUser && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '2rem 1rem' }}>
                    <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '24px', border: `1px solid ${THEME.colors.border}`, width: '100%', maxWidth: '460px', boxShadow: THEME.shadow.lg }}>
                        <h3 style={{ margin: '0 0 1rem 0', fontWeight: '800', color: THEME.colors.textMain }}>Restablecer Contraseña</h3>
                        <p style={{ margin: '0 0 1.5rem 0', color: THEME.colors.textSecondary, fontSize: '0.85rem', lineHeight: '1.4' }}>
                            Establece una nueva contraseña para <span style={{ fontWeight: '700', color: THEME.colors.textMain }}>{resettingUser.contact_name}</span> ({resettingUser.email}).
                            Si la dejas en blanco, el sistema generará una contraseña segura automáticamente.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>Nueva Contraseña (Opcional)</label>
                                <input 
                                    type="text" 
                                    value={inputResetPassword} 
                                    onChange={e => setInputResetPassword(e.target.value)}
                                    placeholder="Dejar en blanco para autogenerar"
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: `1.5px solid ${THEME.colors.border}`, fontWeight: '600', boxSizing: 'border-box', outline: 'none' }}
                                />
                                <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, display: 'block', marginTop: '0.3rem' }}>
                                    Debe tener al menos 6 caracteres.
                                </span>
                            </div>

                            <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1rem' }}>
                                <button 
                                    onClick={() => setResettingUser(null)}
                                    style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: `1px solid ${THEME.colors.border}`, backgroundColor: 'white', color: THEME.colors.textSecondary, fontWeight: '800', cursor: 'pointer' }}
                                >
                                    Cancelar
                                </button>
                                <button 
                                    onClick={handleConfirmResetPassword}
                                    style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: 'none', backgroundColor: THEME.colors.primary, color: 'white', fontWeight: '800', cursor: 'pointer' }}
                                >
                                    Restablecer Ahora
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 5: GESTIÓN DE PERMISOS PERSONALIZADOS */}
            {editingPermissionsUser && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '2rem 1rem' }}>
                    <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '24px', border: `1px solid ${THEME.colors.border}`, width: '100%', maxWidth: '640px', boxShadow: THEME.shadow.lg }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <ShieldCheck size={28} style={{ color: THEME.colors.primary }} />
                            <div>
                                <h3 style={{ margin: 0, fontWeight: '800', color: THEME.colors.textMain }}>Árbol de Permisos Personalizados</h3>
                                <p style={{ margin: '0.1rem 0 0 0', color: THEME.colors.textSecondary, fontSize: '0.8rem' }}>
                                    Configura los accesos granulares para <span style={{ fontWeight: '700' }}>{editingPermissionsUser.contact_name}</span>.
                                </p>
                            </div>
                        </div>

                        <p style={{ margin: '0 0 1.5rem 0', color: THEME.colors.textSecondary, fontSize: '0.85rem', lineHeight: '1.4' }}>
                            El operario cuenta con el rol base <strong style={{ color: THEME.colors.primary, textTransform: 'uppercase' }}>{editingPermissionsUser.role}</strong>. 
                            Los permisos seleccionados aquí actuarán como reglas adicionales/anulaciones específicas del perfil. Las casillas semi-marcadas <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>[-]</span> indican que solo se ha concedido acceso a ciertas sub-rutas.
                        </p>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <PermissionTreeEditor 
                                initialPermissions={tempPermissions} 
                                onChange={setTempPermissions} 
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button 
                                onClick={() => setEditingPermissionsUser(null)}
                                style={{ 
                                    padding: '0.65rem 1.2rem', 
                                    borderRadius: '12px', 
                                    border: `1px solid ${THEME.colors.border}`, 
                                    backgroundColor: 'white', 
                                    color: THEME.colors.textSecondary, 
                                    fontWeight: '700', 
                                    cursor: 'pointer' 
                                }}
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleSavePermissions}
                                disabled={isSavingPermissions}
                                style={{ 
                                    padding: '0.65rem 1.2rem', 
                                    borderRadius: '12px', 
                                    border: 'none', 
                                    backgroundColor: THEME.colors.primary, 
                                    color: 'white', 
                                    fontWeight: '800', 
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}
                            >
                                {isSavingPermissions ? (
                                    <>
                                        <RefreshCw size={15} className="animate-spin" /> Guardando...
                                    </>
                                ) : (
                                    'Guardar Permisos'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .animate-spin {
                    animation: spin 1s linear infinite;
                    display: inline-block;
                }
            `}</style>
        </div>
    );
}
