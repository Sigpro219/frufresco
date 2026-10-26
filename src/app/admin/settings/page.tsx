'use client';

import { useState, useEffect } from 'react';
import { supabase, verifyConnectivity } from '@/lib/supabase';
import { useAuth, checkUserPermission } from '@/lib/authContext';
import Toast from '@/components/Toast';
import Link from 'next/link';
import { diagnoseStorageError } from '@/lib/errorUtils';
import ManageAttributesModal from '@/components/ManageAttributesModal';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';
import { 
    AlertCircle, 
    Settings as SettingsIcon, 
    Sliders, 
    Palette, 
    Phone, 
    FileText, 
    ChevronDown, 
    Image as ImageIcon, 
    Activity, 
    Loader2, 
    Lightbulb, 
    ArrowLeft,
    Building2,
    Save,
    ShieldAlert,
    Sparkles,
    PackageCheck,
    Percent,
    CalendarX,
    CalendarClock,
    Store,
    BookmarkCheck,
    CheckCircle2,
    Mail,
    Clock
} from 'lucide-react';
import { parseStoreVacationConfig, getHolyWeekRange, StoreVacationConfig } from '@/lib/colombianHolidays';

function ImageUpload({ 
    label, 
    value, 
    onUpload, 
    onClear,
    description,
    bucket = 'branding'
}: { 
    label: string, 
    value: string, 
    onUpload: (url: string) => void, 
    onClear: () => void,
    description?: string,
    bucket?: string
}) {
    const [uploading, setUploading] = useState(false);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        setUploading(true);

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from(bucket)
                .upload(filePath, file);

            if (uploadError) {
                diagnoseStorageError(uploadError, bucket);
                throw uploadError;
            }

            const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath);
            onUpload(publicUrl);
            (window as any).showToast?.('Imagen subida con éxito', 'success');
        } catch (err: any) {
            console.error('Upload error:', err);
            (window as any).showToast?.('Error al subir: ' + err.message, 'error');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div style={{ 
            backgroundColor: THEME.colors.surface, 
            borderRadius: THEME.radius.lg, 
            padding: '1.2rem', 
            border: `1px solid ${THEME.colors.border}`,
            boxShadow: THEME.shadow.sm,
            transition: 'all 0.2s ease-in-out'
        }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textMain, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</h4>
            {description && <p style={{ margin: '0 0 12px 0', fontSize: '0.7rem', color: THEME.colors.textSecondary }}>{description}</p>}
            
            <div style={{ display: 'flex', gap: '1.2rem', alignItems: 'center' }}>
                {value ? (
                    <div style={{ 
                        position: 'relative', 
                        width: '100px', 
                        height: '100px', 
                        borderRadius: THEME.radius.md, 
                        overflow: 'hidden', 
                        border: `1px solid ${THEME.colors.border}`, 
                        backgroundColor: '#F9FAFB', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        padding: '8px' 
                    }}>
                        <img src={value} alt={label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        <button 
                            onClick={(e) => { e.preventDefault(); onClear(); }}
                            style={{ 
                                position: 'absolute', 
                                top: '4px', 
                                right: '4px', 
                                backgroundColor: 'rgba(239, 68, 68, 0.9)', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '50%', 
                                width: '20px', 
                                height: '20px', 
                                cursor: 'pointer', 
                                fontSize: '12px', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                transition: 'background-color 0.2s'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#DC2626'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.9)'}
                        >
                            ×
                        </button>
                    </div>
                ) : (
                    <div style={{ 
                        width: '100px', 
                        height: '100px', 
                        borderRadius: THEME.radius.md, 
                        border: `2px dashed ${THEME.colors.borderActive}`, 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        backgroundColor: '#F9FAFB', 
                        color: THEME.colors.textSecondary 
                    }}>
                        <ImageIcon size={24} strokeWidth={1.5} />
                    </div>
                )}
                
                <div style={{ flex: 1 }}>
                    <label style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '8px 16px', 
                        backgroundColor: uploading ? '#9CA3AF' : THEME.colors.primary, 
                        color: 'white', 
                        borderRadius: THEME.radius.md, 
                        cursor: uploading ? 'not-allowed' : 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        transition: 'all 0.2s',
                        boxShadow: THEME.shadow.sm
                    }}
                    onMouseOver={(e) => {
                        if (!uploading) e.currentTarget.style.backgroundColor = THEME.colors.primaryHover;
                    }}
                    onMouseOut={(e) => {
                        if (!uploading) e.currentTarget.style.backgroundColor = THEME.colors.primary;
                    }}
                    >
                        {uploading ? (
                            <>
                                <Loader2 size={14} className="animate-spin" strokeWidth={1.5} />
                                <span>Subiendo...</span>
                            </>
                        ) : (
                            <span>{value ? 'Cambiar Imagen' : 'Subir Imagen'}</span>
                        )}
                        <input type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} style={{ display: 'none' }} />
                    </label>
                    <p style={{ margin: '6px 0 0 0', fontSize: '0.65rem', color: THEME.colors.textSecondary }}>PNG, JPG o WEBP. Máx 2MB.</p>
                </div>
            </div>
        </div>
    );
}

export default function AdminSettingsPage() {
    const { profile } = useAuth();
    const [roles, setRoles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);
    const [persisted, setPersisted] = useState(false);
    const [openSections, setOpenSections] = useState<string[]>(['operation']); 
    const [showAttributesModal, setShowAttributesModal] = useState(false);
    const [connStatus, setConnStatus] = useState<{ ok: boolean, latency?: string, storageOk?: boolean, checked: boolean, checking: boolean }>({
        ok: true, checked: false, checking: false
    });
    const [hoveredSection, setHoveredSection] = useState<string | null>(null);

    const hasPermission = (permission: string) => {
        return checkUserPermission(profile, permission, roles);
    };

    const canView = hasPermission('admin.dashboard.settings.view');
    const canEdit = hasPermission('admin.dashboard.settings.edit');

    // Expand all sections if user is view-only
    useEffect(() => {
        if (!loading && !canEdit) {
            setOpenSections(['operation', 'variants', 'design', 'b2b', 'contact', 'corporate']);
        }
    }, [loading, canEdit]);

    const checkHealth = async () => {
        setConnStatus(prev => ({ ...prev, checking: true }));
        const result = await verifyConnectivity();
        setConnStatus({
            ok: result.ok,
            latency: result.latency,
            storageOk: result.storageOk,
            checked: true,
            checking: false
        });
        
        if (!result.ok) {
            (window as any).showToast?.('Error de conexión: ' + result.error, 'error');
        } else if (!result.storageOk) {
            (window as any).showToast?.('Base de datos OK, pero Storage no responde', 'warning');
        } else {
            (window as any).showToast?.('Conexión exitosa (' + result.latency + ')', 'success');
        }
    };

    const toggleSection = (id: string) => {
        if (!canEdit) return; // Prevent collapse/expand manual adjustments when view-only
        setOpenSections(prev => 
            prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
        );
    };

    const fetchSettings = async () => {
        setLoading(true);
        let rolesData = null;
        let rolesError = null;
        let settingsData = null;
        let settingsError = null;

        try {
            const [rolesRes, settingsRes] = await Promise.all([
                supabase.from('app_settings').select('key, value').eq('key', 'system_roles').maybeSingle(),
                supabase.from('app_settings').select('*').order('key')
            ]);
            rolesData = rolesRes.data;
            rolesError = rolesRes.error;
            settingsData = settingsRes.data;
            settingsError = settingsRes.error;
        } catch (e) {
            console.error('Error fetching settings/roles:', e);
        }

        if (!rolesError && rolesData?.value) {
            try {
                setRoles(JSON.parse(rolesData.value));
            } catch (e) {
                console.error('Error parsing system_roles:', e);
            }
        }

        const data = settingsData;
        const error = settingsError;

        const defaultSettings = [
            { key: 'delivery_fee', value: '5000', description: 'Costo de envío estándar' },
            { key: 'email_notifications_mode', value: 'sandbox', description: 'Modo de Notificaciones por Correo Saliente' },
            { key: 'email_sandbox_recipient', value: 'auditoria.investment@gmail.com', description: 'Correo Destino para Modo Pruebas / Sandbox' },
            { key: 'min_order_hogar', value: '30000', description: 'Pedido mínimo para la Línea Hogar' },
            { key: 'max_order_hogar_cod', value: '400000', description: 'Tope máximo para pedidos Hogar con pago Contra Entrega' },
            { key: 'min_order_institucional', value: '150000', description: 'Pedido mínimo para la Línea Institucional' },
            { key: 'enable_cutoff_rules', value: 'true', description: 'Habilitar Reglas de Hora de Corte (Desactivar para Pruebas)' },
            { key: 'cutoff_hour_admin', value: '20', description: 'Hora de corte para toma manual de pedidos Admin / B2B (24h)' },
            { key: 'cutoff_hour_public', value: '17', description: 'Hora de corte para tienda web pública B2C (24h)' },
            { key: 'allow_sunday_deliveries', value: 'false', description: '¿Permitir entregas los Domingos?' },
            { key: 'allow_holiday_deliveries', value: 'false', description: '¿Permitir entregas los Días Festivos (19 Días Colombia)?' },
            { key: 'enable_b2b_lead_capture', value: 'true', description: 'Canal de registro para nuevos clientes institucionales (B2B)' },
            { key: 'inbox_email_orders', value: 'pedidos@frufresco.com', description: 'Correo de Ingesta de Pedidos (AI)' },
            { key: 'inbox_email_commercial', value: 'contacto@investmentscortes.com', description: 'Correo Comercial de Negociaciones' },
            { key: 'hero_title', value: 'Excelencia en Frescura \n para tu Negocio y Hogar', description: 'Título principal del banner de inicio' },
            { key: 'hero_description', value: 'Somos el aliado estratégico de los mejores restaurantes y casinos de Bogotá. Llevamos la calidad de Corabastos a tu puerta, con cero desperdicio y puntualidad suiza.', description: 'Texto secundario del banner de inicio' },
            { 
              key: 'value_proposition_items', 
              value: JSON.stringify([
                { icon: 'clock', title: 'Entrega Puntual', desc: 'Tu operación no puede detenerse. Garantizamos entregas antes de la apertura de tu cocina.' },
                { icon: 'sprout', title: 'Frescura Absoluta', desc: 'Seleccionamos producto a producto cada madrugada. Lo que recibes hoy, se cosechó ayer.' },
                { icon: 'sparkles', title: 'Precios Competitivos', desc: 'Sin intermediarios innecesarios. Optimizamos la cadena para darte el mejor margen.' }
              ]), 
              description: 'Los 3 pilares de valor que se muestran en el inicio' 
            },
            { 
                key: 'b2b_page_content', 
                value: JSON.stringify({
                    badge: 'Exclusivo HORECA e Institucional BOG',
                    title: 'Tu Operación Merece \n Lo Mejor del Campo',
                    description: 'Únete a los +500 restaurantes, hoteles, casinos y comedores que ya compran sin intermediarios. Calidad estandarizada, trazabilidad y precios fijos para tu volumen.',
                    benefits: [
                        { icon: 'rocket', title: 'Entrega AM', desc: 'Todo listo antes de abrir cocina.' },
                        { icon: 'banknote', title: 'Precios Justos', desc: 'Ahorro directo sin intermediarios.' },
                        { icon: 'carrot', title: 'Frescura Total', desc: 'Cosechado ayer, entregado hoy.' },
                        { icon: 'credit-card', title: 'Crédito B2B', desc: 'Paga a 15 o 30 días fácil.' }
                    ]
                }), 
                description: 'Contenido dinámico de la página de registro B2B' 
            },
            { key: 'store_status', value: 'open', description: 'Estado actual de la tienda (Abierto/Preventa/Cerrado)' },
            { 
                key: 'store_vacation_config', 
                value: JSON.stringify({
                    enabled: false,
                    startDate: '',
                    endDate: '',
                    reopenTime: '06:00 AM',
                    reasonTitle: 'Receso de Semana Santa',
                    customMessage: 'Agenda tu pedido hoy y recíbelo fresco en nuestro primer día hábil de retorno.'
                }), 
                description: 'Programador de recesos operativos, Semana Santa y vacaciones' 
            },
            { key: 'global_banner', value: '', description: 'Anuncio superior (ej: ¡Envíos gratis hoy!)' },
            { key: 'home_featured_title', value: 'Lo más vendido de la semana', description: 'Título sección productos destacados' },
            { key: 'home_catalog_title', value: 'Nuestro Catálogo', description: 'Título sección catálogo general' },
            { key: 'contact_phone', value: '+57 300 123 4567', description: 'Teléfono de contacto (Footer)' },
            { key: 'contact_email', value: 'contacto@frufresco.com', description: 'Email de contacto (Footer)' },
            { key: 'contact_address', value: 'Corabastos Bodega 123, Bogotá', description: 'Dirección física (Footer)' },
            { key: 'app_logo_url', value: '', description: 'URL del logo de la aplicación para Navbar y Footer' },
            { key: 'app_logosymbol_url', value: '', description: 'URL del logosímbolo pequeño para la página de OPS' },
            { key: 'app_name', value: 'FruFresco', description: 'Nombre oficial de la aplicación (SEO)' },
            { key: 'app_short_name', value: 'FruFresco', description: 'Nombre corto (Navbar/Mobile)' },
            { key: 'provider_nit', value: '901.234.567-8', description: 'NIT de la Empresa para Documentos' },
            { key: 'provider_legal_name', value: 'Logistics Pro S.A.S', description: 'Razón Social (Emisor de Documentos)' },
            { key: 'provider_logo_url', value: '', description: 'Logo Oficial (Para Documentos y Facturas)' },
            { key: 'primary_color', value: '#0891B2', description: 'Color Primario (Documentos y Detalles)' },
            { key: 'secondary_color', value: '#10B981', description: 'Color Secundario (Acentos)' }
        ];

        if (error) {
            console.warn('Config table not found or error:', error.message);
            setPersisted(false);
            setSettings(defaultSettings);
        } else {
            setPersisted(data && data.length > 0);
            
            const merged = [...defaultSettings];
            if (data && data.length > 0) {
                data.forEach((realS: { key: string; value: string; description?: string }) => {
                    const idx = merged.findIndex(m => m.key === realS.key);
                    if (idx !== -1) merged[idx] = { ...merged[idx], value: realS.value };
                    else merged.push({ ...realS, description: realS.description || 'Auto-created' });
                });
            }
            setSettings(merged);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const handleUpdateSetting = async (key: string, newValue: string) => {
        if (!canEdit) {
            (window as any).showToast?.('No tienes permisos de edición en este módulo.', 'error');
            return;
        }
        setSaving(true);
        const { error } = await supabase
            .from('app_settings')
            .upsert({ key, value: newValue, updated_at: new Date().toISOString() });

        if (error) {
            console.error('Supabase Save Error:', error);
            (window as any).showToast?.('Error al guardar: ' + error.message, 'error');
        } else {
            // Sincronización proactiva del registro maestro en Flota SaaS (Command Center)
            const brandingKeys = ['app_logo_url', 'app_name', 'app_logosymbol_url', 'app_short_name', 'provider_logo_url'];
            if (brandingKeys.includes(key)) {
                try {
                    // Solo intentamos actualizar si la tabla fleet_tenants existe (caso del CORE)
                    const { data: fleet } = await supabase
                        .from('fleet_tenants')
                        .select('id, branding_config')
                        .eq('supabase_url', process.env.NEXT_PUBLIC_SUPABASE_URL || '')
                        .single();
                    
                    if (fleet) {
                        const newBranding = { 
                            ...(fleet.branding_config || {}),
                            [key === 'app_logo_url' ? 'app_logo_url' : key]: newValue 
                        };
                        // Normalizamos nombres de keys si es necesario para el Command Center
                        await supabase
                            .from('fleet_tenants')
                            .update({ 
                                branding_config: newBranding,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', fleet.id);
                        console.log('Registro de Flota actualizado proactivamente');
                    }
                } catch (fleetErr) {
                    // Silencioso si falla (en tenantes hijos la tabla no existe)
                    console.warn('Entorno independiente (Hijo) o sin tabla de flota. Sincronización maestro omitida.', fleetErr);
                }
            }

            setSettings(prev => {
                const existing = prev.find(s => s.key === key);
                if (existing) {
                    return prev.map(s => s.key === key ? { ...s, value: newValue } : s);
                } else {
                    return [...prev, { key, value: newValue, description: 'Auto-created' }];
                }
            });
            setPersisted(true);
            (window as any).showToast?.('Cambio guardado ', 'success');
        }
        setSaving(false);
    };

    if (loading) {
        return (
            <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.colors.background }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <Loader2 size={36} className="animate-spin" style={{ color: THEME.colors.primary }} />
                    <span style={{ color: THEME.colors.textSecondary, fontSize: '0.85rem', fontWeight: '600' }}>Cargando información...</span>
                </div>
            </main>
        );
    }

    if (!canView) {
        return (
            <main style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.colors.background }}>
                <div style={{
                    textAlign: 'center',
                    padding: '3rem',
                    backgroundColor: THEME.colors.surface,
                    borderRadius: THEME.radius.lg,
                    boxShadow: THEME.shadow.md,
                    maxWidth: '480px',
                    border: `1px solid ${THEME.colors.border}`,
                }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        color: '#EF4444',
                        marginBottom: '1.5rem',
                    }}>
                        <ShieldAlert size={32} />
                    </div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: THEME.colors.textMain, marginBottom: '0.75rem' }}>
                        Acceso Denegado
                    </h1>
                    <p style={{ color: THEME.colors.textSecondary, fontSize: '0.95rem', lineHeight: '1.5' }}>
                        No tienes los permisos necesarios para visualizar este módulo. Por favor, solicita acceso a un administrador si consideras que esto es un error.
                    </p>
                </div>
            </main>
        );
    }

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            <Toast />
            {showAttributesModal && <ManageAttributesModal onClose={() => setShowAttributesModal(false)} />}
            <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>
                {!canEdit && (
                    <div style={{
                        padding: '12px 16px',
                        borderRadius: THEME.radius.md,
                        backgroundColor: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.2)',
                        color: '#D97706',
                        fontSize: '0.85rem',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '1.5rem'
                    }}>
                        <ShieldAlert size={16} />
                        <span>Modo Vista: No tienes permisos para modificar los parámetros globales.</span>
                    </div>
                )}
                <Link href="/admin/dashboard" style={{
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '0.5rem', 
                    color: THEME.colors.textSecondary,
                    textDecoration: 'none', 
                    fontWeight: '600', 
                    marginBottom: '1rem', 
                    fontSize: '0.85rem',
                    transition: 'color 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.color = THEME.colors.primary}
                onMouseOut={(e) => e.currentTarget.style.color = THEME.colors.textSecondary}
                >
                    <ArrowLeft size={16} strokeWidth={1.5} />
                    <span>Volver al Dashboard</span>
                </Link>

                <header style={{ marginBottom: '1.5rem' }}>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.02em' }}>Parámetros Globales (Cutoff)</h1>
                    <p style={{ color: THEME.colors.textSecondary, marginTop: '0.25rem', fontSize: '0.9rem' }}>Control Maestro de parámetros globales.</p>
                </header>

                {/* --- CONNECTIVITY CHECKER --- */}
                <div style={{ 
                    marginBottom: '1.2rem', 
                    padding: '0.8rem 1.2rem', 
                    backgroundColor: connStatus.checked 
                        ? (connStatus.ok && connStatus.storageOk ? '#F0FDF4' : '#FEF2F2') 
                        : THEME.colors.surface,
                    borderRadius: THEME.radius.lg,
                    border: `1px solid ${
                        connStatus.checked 
                            ? (connStatus.ok && connStatus.storageOk ? '#DCFCE7' : '#FEE2E2') 
                            : THEME.colors.border
                    }`,
                    boxShadow: THEME.shadow.sm,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ 
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            backgroundColor: connStatus.checked 
                                ? (connStatus.ok && connStatus.storageOk ? '#DCFCE7' : '#FEE2E2') 
                                : THEME.colors.primaryLight,
                            color: connStatus.checked 
                                ? (connStatus.ok && connStatus.storageOk ? THEME.colors.primary : '#EF4444') 
                                : THEME.colors.textSecondary
                        }}>
                            <Activity size={16} strokeWidth={1.5} className={connStatus.checking ? "animate-spin" : ""} />
                        </div>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: '600', color: THEME.colors.textMain }}>
                                {connStatus.checking ? 'Verificando enlace...' : 
                                 !connStatus.checked ? 'Estado de conexión no verificado' :
                                 connStatus.ok && connStatus.storageOk ? 'Sistemas en Línea' :
                                 !connStatus.ok ? 'Error de Conexión Base' : 'Error en Almacenamiento'}
                            </p>
                            {connStatus.checked && (
                                <p style={{ margin: 0, fontSize: '0.7rem', color: THEME.colors.textSecondary }}>
                                    {connStatus.ok ? `Latencia: ${connStatus.latency} | Almacenamiento: ${connStatus.storageOk ? 'Activo' : 'Fallo'}` : 'Verifica tu conexión o bloqueadores'}
                                </p>
                            )}
                        </div>
                    </div>
                    <button 
                        onClick={checkHealth}
                        disabled={connStatus.checking}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: THEME.colors.surface,
                            border: `1px solid ${THEME.colors.border}`,
                            borderRadius: THEME.radius.md,
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            color: THEME.colors.textMain,
                            cursor: connStatus.checking ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: THEME.shadow.sm,
                            transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => {
                            if (!connStatus.checking) {
                                e.currentTarget.style.backgroundColor = THEME.colors.background;
                                e.currentTarget.style.borderColor = THEME.colors.borderActive;
                            }
                        }}
                        onMouseOut={(e) => {
                            if (!connStatus.checking) {
                                e.currentTarget.style.backgroundColor = THEME.colors.surface;
                                e.currentTarget.style.borderColor = THEME.colors.border;
                            }
                        }}
                    >
                        {connStatus.checking ? (
                            <>
                                <Loader2 size={12} className="animate-spin" strokeWidth={1.5} />
                                <span>Cargando...</span>
                            </>
                        ) : (
                            <span>Probar Conexión</span>
                        )}
                    </button>
                </div>

                <div style={{ pointerEvents: canEdit ? 'auto' : 'none', opacity: canEdit ? 1 : 0.85 }}>
                {/* --- SECCIÓN 1: OPERACIÓN --- */}
                <div style={{ marginBottom: '1rem' }}>
                    <button 
                        onClick={() => toggleSection('operation')}
                        onMouseEnter={() => setHoveredSection('operation')}
                        onMouseLeave={() => setHoveredSection(null)}
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '12px', 
                            background: THEME.colors.surface, 
                            border: `1px solid ${hoveredSection === 'operation' ? THEME.colors.borderActive : THEME.colors.border}`, 
                            cursor: 'pointer', 
                            width: '100%', 
                            padding: '1.2rem', 
                            borderRadius: THEME.radius.lg, 
                            boxShadow: hoveredSection === 'operation' ? THEME.shadow.md : THEME.shadow.sm,
                            transform: hoveredSection === 'operation' ? 'translateY(-1px)' : 'none',
                            transition: 'all 0.2s ease-in-out' 
                        }}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: THEME.radius.md, backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary }}>
                            <SettingsIcon size={18} strokeWidth={1.5} />
                        </span>
                        <div style={{ textAlign: 'left', flex: 1 }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: THEME.colors.textMain, margin: 0 }}>Operación de Tienda</h2>
                            <p style={{ color: THEME.colors.textSecondary, fontSize: '0.8rem', margin: 0 }}>Estados, pedidos mínimos y costos operativos.</p>
                        </div>
                        <span style={{ 
                            display: 'flex',
                            alignItems: 'center',
                            color: THEME.colors.textSecondary,
                            transform: openSections.includes('operation') ? 'rotate(180deg)' : 'none', 
                            transition: 'transform 0.2s ease-in-out' 
                        }}>
                            <ChevronDown size={18} strokeWidth={1.5} />
                        </span>
                    </button>
                    {openSections.includes('operation') && (
                        <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: '1fr 1fr', 
                            gap: '1.2rem', 
                            marginTop: '0.75rem', 
                            padding: '1.2rem', 
                            backgroundColor: '#FAFBFB', 
                            borderRadius: THEME.radius.lg,
                            border: `1px solid ${THEME.colors.border}`,
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.01)'
                        }}>
                            {(() => {
                                const opKeys = ['store_status', 'store_vacation_config', 'email_notifications_mode', 'email_sandbox_recipient', 'delivery_fee', 'min_order_hogar', 'max_order_hogar_cod', 'min_order_institucional', 'enable_b2b_lead_capture', 'enable_cutoff_rules', 'allow_sunday_deliveries', 'allow_holiday_deliveries', 'packaging_fee_enabled', 'packaging_fee_percentage', 'packaging_fee_note'];
                                return settings
                                    .filter(s => opKeys.includes(s.key))
                                    .sort((a, b) => opKeys.indexOf(a.key) - opKeys.indexOf(b.key))
                                    .map((setting) => {
                                        if (setting.key === 'enable_cutoff_rules') {
                                            const isCutoffActive = setting.value === 'true';
                                            const cutoffAdminSetting = settings.find(s => s.key === 'cutoff_hour_admin');
                                            const cutoffPublicSetting = settings.find(s => s.key === 'cutoff_hour_public');
                                            const cutoffAdminVal = cutoffAdminSetting?.value || '20';
                                            const cutoffPublicVal = cutoffPublicSetting?.value || '17';

                                            return (
                                                <div 
                                                    key="governance_cutoff_panel"
                                                    style={{
                                                        gridColumn: '1 / -1',
                                                        backgroundColor: THEME.colors.surface,
                                                        borderRadius: THEME.radius.lg,
                                                        border: `1.5px solid ${isCutoffActive ? '#86EFAC' : '#FCD34D'}`,
                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                                                        overflow: 'hidden',
                                                        marginTop: '0.25rem',
                                                        marginBottom: '0.25rem'
                                                    }}
                                                >
                                                    {/* Header del Bloque */}
                                                    <div style={{
                                                        padding: '1.25rem 1.25rem 1rem 1.25rem',
                                                        borderBottom: `1px solid ${THEME.colors.border}`,
                                                        backgroundColor: isCutoffActive ? 'rgba(240, 253, 244, 0.7)' : 'rgba(254, 252, 232, 0.7)',
                                                        display: 'flex',
                                                        flexWrap: 'wrap',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        gap: '12px'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <div style={{
                                                                width: '38px',
                                                                height: '38px',
                                                                borderRadius: '10px',
                                                                backgroundColor: isCutoffActive ? '#DCFCE7' : '#FEF3C7',
                                                                color: isCutoffActive ? '#15803D' : '#B45309',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                                            }}>
                                                                <Clock size={20} strokeWidth={2.2} />
                                                            </div>
                                                            <div>
                                                                <h3 style={{
                                                                    margin: 0,
                                                                    fontSize: '0.92rem',
                                                                    fontWeight: '800',
                                                                    color: THEME.colors.textMain,
                                                                    letterSpacing: '0.03em',
                                                                    textTransform: 'uppercase'
                                                                }}>
                                                                    Gobernanza de Horarios de Corte y Despachos (D+1 / D+2)
                                                                </h3>
                                                                <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: THEME.colors.textSecondary }}>
                                                                    Control maestro de horas límite para compras nocturnas y traslado automático de entregas.
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {/* Badge de estado en tiempo real */}
                                                        <div style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            padding: '6px 14px',
                                                            borderRadius: '9999px',
                                                            fontSize: '0.72rem',
                                                            fontWeight: '800',
                                                            backgroundColor: isCutoffActive ? '#DCFCE7' : '#FEF3C7',
                                                            color: isCutoffActive ? '#15803D' : '#B45309',
                                                            border: `1px solid ${isCutoffActive ? '#86EFAC' : '#FCD34D'}`,
                                                            letterSpacing: '0.02em'
                                                        }}>
                                                            {isCutoffActive ? (
                                                                <>
                                                                    <CheckCircle2 size={15} />
                                                                    <span>CORTES ESTRICTOS ACTIVOS</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <AlertCircle size={15} />
                                                                    <span>MODO FLEXIBLE / CONTINGENCIA (SIN BLOQUEOS)</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Cuerpo del Bloque */}
                                                    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                                        {/* Switch Maestro */}
                                                        <div style={{
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '8px',
                                                            padding: '1.1rem',
                                                            borderRadius: THEME.radius.md,
                                                            backgroundColor: isCutoffActive ? '#F0FDF4' : '#FFFBEB',
                                                            border: `1px solid ${isCutoffActive ? '#BBF7D0' : '#FDE68A'}`
                                                        }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                                                                <div style={{ maxWidth: '680px' }}>
                                                                    <span style={{ fontSize: '0.8rem', fontWeight: '800', color: THEME.colors.textMain, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        ⚡ Interruptor Maestro de Reglas de Corte
                                                                    </span>
                                                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: isCutoffActive ? '#166534' : '#92400E', lineHeight: '1.45' }}>
                                                                        {isCutoffActive ? (
                                                                            <>
                                                                                <strong>Reglas Activas (Corte Estricto):</strong> El sistema bloquea automáticamente la toma y edición de pedidos para mañana una vez superada la hora límite, trasladando la fecha de entrega obligatoria a 2 días hábiles (D+2).
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <strong>Modo Flexible de Contingencia (Recomendado para cierres y alta demanda):</strong> Las operadoras, correos AI y clientes pueden agendar pedidos para entrega mañana a cualquier hora de la noche sin bloqueos del calendario.
                                                                            </>
                                                                        )}
                                                                    </p>
                                                                </div>
                                                                <div style={{ minWidth: '240px' }}>
                                                                    <select
                                                                        value={setting.value || 'false'}
                                                                        onChange={(e) => handleUpdateSetting('enable_cutoff_rules', e.target.value)}
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '9px 14px',
                                                                            borderRadius: THEME.radius.sm,
                                                                            border: `1.5px solid ${isCutoffActive ? '#15803D' : '#D97706'}`,
                                                                            fontWeight: '800',
                                                                            fontSize: '0.85rem',
                                                                            color: isCutoffActive ? '#15803D' : '#B45309',
                                                                            backgroundColor: THEME.colors.surface,
                                                                            cursor: 'pointer',
                                                                            outline: 'none',
                                                                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                                                        }}
                                                                    >
                                                                        <option value="true">ACTIVADA — Bloqueo Estricto de Horarios</option>
                                                                        <option value="false">DESACTIVADA — Modo Flexible (Sin Bloqueos)</option>
                                                                    </select>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Subordinados: 2 Columnas para Admin y Tienda */}
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                                                            {/* Tarjeta 1: Admin / B2B */}
                                                            <div style={{
                                                                padding: '1.1rem',
                                                                borderRadius: THEME.radius.md,
                                                                border: `1px solid ${THEME.colors.border}`,
                                                                backgroundColor: THEME.colors.surface,
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                justifyContent: 'space-between',
                                                                gap: '14px'
                                                            }}>
                                                                <div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                                        <h4 style={{ margin: 0, fontSize: '0.78rem', fontWeight: '800', color: THEME.colors.textMain, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                            <Building2 size={16} style={{ color: 'var(--primary)' }} />
                                                                            1. Mesa Operativa & B2B (Admin / Empresas)
                                                                        </h4>
                                                                        <span style={{
                                                                            fontSize: '0.65rem',
                                                                            fontWeight: '800',
                                                                            padding: '3px 8px',
                                                                            borderRadius: '4px',
                                                                            backgroundColor: isCutoffActive ? '#DCFCE7' : '#F1F5F9',
                                                                            color: isCutoffActive ? '#166534' : '#64748B'
                                                                        }}>
                                                                            {isCutoffActive ? `Corte: ${cutoffAdminVal}:00` : 'Horario Libre'}
                                                                        </span>
                                                                    </div>

                                                                    <p style={{ margin: '0 0 12px 0', fontSize: '0.72rem', color: THEME.colors.textSecondary, lineHeight: '1.4' }}>
                                                                        Aplica a la <strong>digitación manual de operadoras</strong>, panel de administración y recepción automática de correos AI de clientes institucionales (restaurantes, casinos, hoteles).
                                                                    </p>

                                                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '800', color: THEME.colors.textSecondary, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                                                        Hora Límite para Despacho Mañana:
                                                                    </label>
                                                                    <select
                                                                        value={cutoffAdminVal}
                                                                        onChange={(e) => handleUpdateSetting('cutoff_hour_admin', e.target.value)}
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '8px 12px',
                                                                            borderRadius: THEME.radius.sm,
                                                                            border: `1px solid ${THEME.colors.borderActive}`,
                                                                            fontWeight: '700',
                                                                            fontSize: '0.85rem',
                                                                            color: THEME.colors.textMain,
                                                                            backgroundColor: THEME.colors.surface,
                                                                            cursor: 'pointer',
                                                                            outline: 'none'
                                                                        }}
                                                                    >
                                                                        <option value="14">02:00 PM (14:00)</option>
                                                                        <option value="15">03:00 PM (15:00)</option>
                                                                        <option value="16">04:00 PM (16:00)</option>
                                                                        <option value="17">05:00 PM (17:00)</option>
                                                                        <option value="18">06:00 PM (18:00)</option>
                                                                        <option value="19">07:00 PM (19:00)</option>
                                                                        <option value="20">08:00 PM (20:00) — (Recomendado Admin B2B)</option>
                                                                        <option value="21">09:00 PM (21:00)</option>
                                                                        <option value="22">10:00 PM (22:00)</option>
                                                                        <option value="23">11:00 PM (23:00)</option>
                                                                    </select>
                                                                </div>

                                                                <div style={{
                                                                    padding: '8px 10px',
                                                                    borderRadius: THEME.radius.sm,
                                                                    backgroundColor: '#F8FAFC',
                                                                    border: `1px dashed ${THEME.colors.border}`,
                                                                    fontSize: '0.68rem',
                                                                    color: '#64748B',
                                                                    lineHeight: '1.35'
                                                                }}>
                                                                    📌 <strong>Efecto en planta:</strong> A esta hora el sistema genera el consolidado de compras nocturnas en Corabastos. Si el corte está activo, pedidos posteriores se agendan para D+2.
                                                                </div>
                                                            </div>

                                                            {/* Tarjeta 2: Tienda Pública / B2C */}
                                                            <div style={{
                                                                padding: '1.1rem',
                                                                borderRadius: THEME.radius.md,
                                                                border: `1px solid ${THEME.colors.border}`,
                                                                backgroundColor: THEME.colors.surface,
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                justifyContent: 'space-between',
                                                                gap: '14px'
                                                            }}>
                                                                <div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                                        <h4 style={{ margin: 0, fontSize: '0.78rem', fontWeight: '800', color: THEME.colors.textMain, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                            <Store size={16} style={{ color: '#D97706' }} />
                                                                            2. Tienda Web Pública (B2C / Hogares)
                                                                        </h4>
                                                                        <span style={{
                                                                            fontSize: '0.65rem',
                                                                            fontWeight: '800',
                                                                            padding: '3px 8px',
                                                                            borderRadius: '4px',
                                                                            backgroundColor: isCutoffActive ? '#FEF3C7' : '#F1F5F9',
                                                                            color: isCutoffActive ? '#92400E' : '#64748B'
                                                                        }}>
                                                                            {isCutoffActive ? `Corte: ${cutoffPublicVal}:00` : 'Horario Libre'}
                                                                        </span>
                                                                    </div>

                                                                    <p style={{ margin: '0 0 12px 0', fontSize: '0.72rem', color: THEME.colors.textSecondary, lineHeight: '1.4' }}>
                                                                        Aplica al <strong>carrito de compras y checkout web</strong> para clientes particulares o de hogar que compran directamente por la tienda online abierta.
                                                                    </p>

                                                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '800', color: THEME.colors.textSecondary, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                                                        Hora Límite para Despacho Mañana:
                                                                    </label>
                                                                    <select
                                                                        value={cutoffPublicVal}
                                                                        onChange={(e) => handleUpdateSetting('cutoff_hour_public', e.target.value)}
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '8px 12px',
                                                                            borderRadius: THEME.radius.sm,
                                                                            border: `1px solid ${THEME.colors.borderActive}`,
                                                                            fontWeight: '700',
                                                                            fontSize: '0.85rem',
                                                                            color: THEME.colors.textMain,
                                                                            backgroundColor: THEME.colors.surface,
                                                                            cursor: 'pointer',
                                                                            outline: 'none'
                                                                        }}
                                                                    >
                                                                        <option value="14">02:00 PM (14:00)</option>
                                                                        <option value="15">03:00 PM (15:00)</option>
                                                                        <option value="16">04:00 PM (16:00)</option>
                                                                        <option value="17">05:00 PM (17:00) — (Recomendado Tienda B2C)</option>
                                                                        <option value="18">06:00 PM (18:00)</option>
                                                                        <option value="19">07:00 PM (19:00)</option>
                                                                        <option value="20">08:00 PM (20:00)</option>
                                                                        <option value="21">09:00 PM (21:00)</option>
                                                                        <option value="22">10:00 PM (22:00)</option>
                                                                        <option value="23">11:00 PM (23:00)</option>
                                                                    </select>
                                                                </div>

                                                                <div style={{
                                                                    padding: '8px 10px',
                                                                    borderRadius: THEME.radius.sm,
                                                                    backgroundColor: '#F8FAFC',
                                                                    border: `1px dashed ${THEME.colors.border}`,
                                                                    fontSize: '0.68rem',
                                                                    color: '#64748B',
                                                                    lineHeight: '1.35'
                                                                }}>
                                                                    🛒 <strong>Efecto en checkout:</strong> Pasada esta hora, el selector de fecha en la tienda desactiva el día siguiente para evitar comprometer entregas sin abastecimiento.
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return (
                                        <div key={setting.key} style={{ 
                                            backgroundColor: THEME.colors.surface, 
                                            borderRadius: THEME.radius.md, 
                                            padding: '1rem', 
                                            border: `1px solid ${THEME.colors.border}`,
                                            boxShadow: THEME.shadow.sm,
                                            gridColumn: (setting.key === 'packaging_fee_note' || setting.key === 'store_vacation_config') ? '1 / -1' : 'span 1'
                                        }}>
                                            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textMain, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {setting.key === 'delivery_fee' ? 'Costo de Envío' :
                                                 setting.key === 'email_notifications_mode' ? <><Mail size={14} style={{ color: 'var(--primary)' }} /> Notificaciones por Correo Saliente</> :
                                                 setting.key === 'email_sandbox_recipient' ? <><Mail size={14} style={{ color: '#D97706' }} /> Correo Destino Modo Pruebas (Sandbox)</> :
                                                 setting.key === 'min_order_hogar' ? 'Mínimo Hogar' :
                                                 setting.key === 'max_order_hogar_cod' ? 'Máximo Hogar (Contra Entrega)' :
                                                 setting.key === 'min_order_institucional' ? 'Mínimo Institucional' :
                                                 setting.key === 'store_status' ? <><Store size={14} style={{ color: 'var(--primary)' }} /> Estado Operativo de la Tienda</> :
                                                 setting.key === 'store_vacation_config' ? <><CalendarClock size={14} style={{ color: '#D97706' }} /> Programador de Receso Operativo / Semana Santa / Vacaciones</> :
                                                 setting.key === 'enable_b2b_lead_capture' ? 'Captura Leads B2B' :
                                                 setting.key === 'enable_cutoff_rules' ? <><Clock size={14} style={{ color: 'var(--primary)' }} /> REGLAS HORA DE CORTE</> :
                                                 setting.key === 'cutoff_hour_admin' ? <><Clock size={14} style={{ color: 'var(--primary)' }} /> HORA CORTE ADMIN / B2B</> :
                                                 setting.key === 'cutoff_hour_public' ? <><Clock size={14} style={{ color: '#D97706' }} /> HORA CORTE TIENDA PÚBLICA (B2C)</> :
                                                 setting.key === 'allow_sunday_deliveries' ? <><CalendarX size={14} style={{ color: 'var(--primary)' }} /> ENTREGAS LOS DOMINGOS</> :
                                                 setting.key === 'allow_holiday_deliveries' ? <><Sparkles size={14} style={{ color: '#D97706' }} /> ENTREGAS EN FESTIVOS (19 DÍAS COLOMBIA)</> :
                                                 setting.key === 'packaging_fee_enabled' ? <><PackageCheck size={14} style={{ color: 'var(--primary)' }} /> Cobro Empaque Plástico (Checkout)</> :
                                                 setting.key === 'packaging_fee_percentage' ? <><Percent size={14} style={{ color: 'var(--primary)' }} /> PORCENTAJE EMPAQUE</> :
                                                 setting.key === 'packaging_fee_note' ? <><FileText size={14} style={{ color: 'var(--primary)' }} /> Explicación de Empaque (Nota Cliente)</> :
                                                 setting.key.replace(/_/g, ' ')}
                                            </h4>
                                            {setting.key === 'email_notifications_mode' ? (
                                                <select 
                                                    value={setting.value || 'sandbox'} 
                                                    onChange={(e) => handleUpdateSetting(setting.key, e.target.value)} 
                                                    style={{ 
                                                        width: '100%', 
                                                        padding: '8px 12px', 
                                                        borderRadius: THEME.radius.sm, 
                                                        border: `1px solid ${THEME.colors.borderActive}`, 
                                                        fontWeight: '700',
                                                        fontSize: '0.85rem',
                                                        color: setting.value === 'live' ? '#15803D' : setting.value === 'disabled' ? '#DC2626' : '#B45309',
                                                        backgroundColor: setting.value === 'live' ? '#DCFCE7' : setting.value === 'disabled' ? '#FEE2E2' : '#FEF3C7',
                                                        cursor: 'pointer',
                                                        outline: 'none'
                                                    }}
                                                >
                                                    <option value="sandbox">MODO PRUEBAS (Sandbox / Redirigir)</option>
                                                    <option value="disabled">DESACTIVADO (Silencioso: No enviar)</option>
                                                    <option value="live">PRODUCCIÓN REAL (Clientes)</option>
                                                </select>
                                            ) : setting.key === 'email_sandbox_recipient' ? (
                                                <div>
                                                    <input 
                                                        type="email" 
                                                        defaultValue={setting.value || 'auditoria.investment@gmail.com'} 
                                                        placeholder="ej: auditoria.investment@gmail.com"
                                                        onBlur={(e) => handleUpdateSetting(setting.key, e.target.value)} 
                                                        style={{ 
                                                            width: '100%', 
                                                            padding: '8px 12px', 
                                                            borderRadius: THEME.radius.sm, 
                                                            border: `1px solid ${THEME.colors.borderActive}`, 
                                                            fontWeight: '600', 
                                                            fontSize: '0.85rem',
                                                            color: THEME.colors.textMain, 
                                                            outline: 'none' 
                                                        }} 
                                                    />
                                                    <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '4px' }}>
                                                        Los correos en Modo Pruebas se redirigirán a esta dirección.
                                                    </div>
                                                </div>
                                            ) : setting.key === 'cutoff_hour_admin' || setting.key === 'cutoff_hour_public' ? (
                                                <select 
                                                    value={setting.value || (setting.key === 'cutoff_hour_admin' ? '20' : '17')} 
                                                    onChange={(e) => handleUpdateSetting(setting.key, e.target.value)} 
                                                    style={{ 
                                                        width: '100%', 
                                                        padding: '8px 12px', 
                                                        borderRadius: THEME.radius.sm, 
                                                        border: `1px solid ${THEME.colors.borderActive}`, 
                                                        fontWeight: '700',
                                                        fontSize: '0.85rem',
                                                        color: THEME.colors.textMain,
                                                        backgroundColor: THEME.colors.surface,
                                                        cursor: 'pointer',
                                                        outline: 'none'
                                                    }}
                                                >
                                                    <option value="14">02:00 PM (14:00)</option>
                                                    <option value="15">03:00 PM (15:00)</option>
                                                    <option value="16">04:00 PM (16:00)</option>
                                                    <option value="17">05:00 PM (17:00) {setting.key === 'cutoff_hour_public' ? '— (Recomendado Tienda)' : ''}</option>
                                                    <option value="18">06:00 PM (18:00)</option>
                                                    <option value="19">07:00 PM (19:00)</option>
                                                    <option value="20">08:00 PM (20:00) {setting.key === 'cutoff_hour_admin' ? '— (Recomendado Admin)' : ''}</option>
                                                    <option value="21">09:00 PM (21:00)</option>
                                                    <option value="22">10:00 PM (22:00)</option>
                                                    <option value="23">11:00 PM (23:00)</option>
                                                </select>
                                            ) : setting.key === 'store_status' ? (
                                                <div>
                                                    <select 
                                                        value={setting.value || 'open'} 
                                                        onChange={(e) => handleUpdateSetting(setting.key, e.target.value)} 
                                                        style={{ 
                                                            width: '100%', 
                                                            padding: '8px 12px', 
                                                            borderRadius: THEME.radius.sm, 
                                                            border: `1px solid ${THEME.colors.borderActive}`, 
                                                            fontWeight: '700', 
                                                            fontSize: '0.85rem',
                                                            color: setting.value === 'closed' ? '#DC2626' : setting.value === 'vacation_preorder' ? '#B45309' : '#15803D',
                                                            backgroundColor: setting.value === 'closed' ? '#FEE2E2' : setting.value === 'vacation_preorder' ? '#FEF3C7' : '#DCFCE7',
                                                            cursor: 'pointer',
                                                            outline: 'none'
                                                        }}
                                                    >
                                                        <option value="open">ABIERTA (Operación Normal)</option>
                                                        <option value="vacation_preorder">MODO PREVENTA / RECESO (Recibe pedidos para entregar al retorno)</option>
                                                        <option value="closed">CERRADA TEMPORALMENTE (Modo Vitrina / Carrito Guardado)</option>
                                                    </select>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '6px', lineHeight: 1.4 }}>
                                                        {setting.value === 'closed' 
                                                            ? 'Catálogo visible en modo vitrina. El checkout pausa el envío y permite al cliente guardar su carrito hasta la reapertura (Cero WhatsApp).'
                                                            : setting.value === 'vacation_preorder'
                                                            ? 'Recomendado en Semana Santa/Vacaciones: La tienda sigue facturando 24/7 y agenda entregas automáticamente para el primer día hábil de retorno.'
                                                            : 'Tienda operando con normalidad según las reglas de hora de corte, domingos y festivos.'}
                                                    </div>
                                                </div>
                                            ) : setting.key === 'store_vacation_config' ? (
                                                (() => {
                                                    const vacConfig: StoreVacationConfig = parseStoreVacationConfig(setting.value);
                                                    const updateVacField = (patch: Partial<StoreVacationConfig>) => {
                                                        const next = { ...vacConfig, ...patch };
                                                        handleUpdateSetting('store_vacation_config', JSON.stringify(next));
                                                    };
                                                    const applyHolyWeekPreset = () => {
                                                        const hw = getHolyWeekRange();
                                                        const next: StoreVacationConfig = {
                                                            ...vacConfig,
                                                            enabled: true,
                                                            startDate: hw.startDate,
                                                            endDate: hw.endDate,
                                                            reopenTime: '06:00 AM',
                                                            reasonTitle: 'Receso Operativo de Semana Santa',
                                                            customMessage: `Estamos en receso de Semana Santa (${hw.startDate} al ${hw.endDate}). Agenda tu pedido hoy y recíbelo con Prioridad #1 de Abastecimiento el lunes ${hw.returnDate}.`
                                                        };
                                                        handleUpdateSetting('store_vacation_config', JSON.stringify(next));
                                                        const currentStatus = settings.find(s => s.key === 'store_status')?.value;
                                                        if (currentStatus === 'open') {
                                                            handleUpdateSetting('store_status', 'vacation_preorder');
                                                        }
                                                    };
                                                    const applyNewYearPreset = () => {
                                                        const year = new Date().getFullYear();
                                                        const startDate = `${year}-12-31`;
                                                        const endDate = `${year + 1}-01-02`;
                                                        const next: StoreVacationConfig = {
                                                            ...vacConfig,
                                                            enabled: true,
                                                            startDate,
                                                            endDate,
                                                            reopenTime: '06:00 AM',
                                                            reasonTitle: 'Receso de Fin de Año',
                                                            customMessage: `Feliz Año Nuevo. Nuestras rutas descansan del ${startDate} al ${endDate}. Agenda tu pedido hoy para entrega prioritaria al retorno.`
                                                        };
                                                        handleUpdateSetting('store_vacation_config', JSON.stringify(next));
                                                    };

                                                    return (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.75rem 1rem', backgroundColor: vacConfig.enabled ? '#FFFBEB' : '#F8FAFC', borderRadius: THEME.radius.sm, border: `1px solid ${vacConfig.enabled ? '#FDE68A' : '#E2E8F0'}` }}>
                                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', color: vacConfig.enabled ? '#92400E' : '#334155' }}>
                                                                    <input 
                                                                        type="checkbox" 
                                                                        checked={vacConfig.enabled} 
                                                                        onChange={(e) => updateVacField({ enabled: e.target.checked })}
                                                                        style={{ width: '16px', height: '16px', accentColor: '#D97706', cursor: 'pointer' }}
                                                                    />
                                                                    <span>Activar bloqueo automático de fechas por Receso / Vacaciones</span>
                                                                </label>
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={applyHolyWeekPreset}
                                                                        style={{
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '6px',
                                                                            padding: '6px 10px',
                                                                            borderRadius: THEME.radius.sm,
                                                                            border: '1px solid #F59E0B',
                                                                            backgroundColor: '#FEF3C7',
                                                                            color: '#92400E',
                                                                            fontSize: '0.72rem',
                                                                            fontWeight: 700,
                                                                            cursor: 'pointer'
                                                                        }}
                                                                    >
                                                                        <Sparkles size={13} />
                                                                        <span>Preset Semana Santa (Jueves a Domingo)</span>
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={applyNewYearPreset}
                                                                        style={{
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '6px',
                                                                            padding: '6px 10px',
                                                                            borderRadius: THEME.radius.sm,
                                                                            border: '1px solid #CBD5E1',
                                                                            backgroundColor: '#FFFFFF',
                                                                            color: '#334155',
                                                                            fontSize: '0.72rem',
                                                                            fontWeight: 600,
                                                                            cursor: 'pointer'
                                                                        }}
                                                                    >
                                                                        <CalendarClock size={13} />
                                                                        <span>Preset Fin de Año (31 Dic - 2 Ene)</span>
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                                                                <div>
                                                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Primer Día Sin Entrega (Inicio)</label>
                                                                    <input 
                                                                        type="date" 
                                                                        value={vacConfig.startDate || ''} 
                                                                        onChange={(e) => updateVacField({ startDate: e.target.value })}
                                                                        style={{ width: '100%', padding: '7px 10px', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.borderActive}`, fontSize: '0.8rem', fontWeight: 600 }}
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Último Día de Receso (Fin)</label>
                                                                    <input 
                                                                        type="date" 
                                                                        value={vacConfig.endDate || ''} 
                                                                        min={vacConfig.startDate || undefined}
                                                                        onChange={(e) => updateVacField({ endDate: e.target.value })}
                                                                        style={{ width: '100%', padding: '7px 10px', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.borderActive}`, fontSize: '0.8rem', fontWeight: 600 }}
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Hora de Retorno Operativo</label>
                                                                    <input 
                                                                        type="text" 
                                                                        defaultValue={vacConfig.reopenTime || '06:00 AM'} 
                                                                        placeholder="ej: 06:00 AM"
                                                                        onBlur={(e) => updateVacField({ reopenTime: e.target.value })}
                                                                        style={{ width: '100%', padding: '7px 10px', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.borderActive}`, fontSize: '0.8rem', fontWeight: 600 }}
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Título del Motivo (Banner)</label>
                                                                    <input 
                                                                        type="text" 
                                                                        defaultValue={vacConfig.reasonTitle || ''} 
                                                                        key={`title-${vacConfig.reasonTitle}`}
                                                                        placeholder="ej: Receso de Semana Santa"
                                                                        onBlur={(e) => updateVacField({ reasonTitle: e.target.value })}
                                                                        style={{ width: '100%', padding: '7px 10px', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.borderActive}`, fontSize: '0.8rem', fontWeight: 600 }}
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div>
                                                                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Mensaje de Hospitalidad al Cliente (Cero Abandono / Cero WhatsApp)</label>
                                                                <textarea 
                                                                    defaultValue={vacConfig.customMessage || ''} 
                                                                    key={`msg-${vacConfig.customMessage}`}
                                                                    onBlur={(e) => updateVacField({ customMessage: e.target.value })}
                                                                    placeholder="Mensaje claro informando cuándo se entregará su pedido..."
                                                                    style={{ width: '100%', padding: '8px 10px', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.borderActive}`, fontSize: '0.8rem', minHeight: '54px', resize: 'vertical' }}
                                                                />
                                                            </div>

                                                            <div style={{ padding: '8px 12px', borderRadius: THEME.radius.sm, backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', fontSize: '0.73rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                                                                <span>
                                                                    <strong>Política Anti-Abandono Autónomo:</strong> Cuando el receso está activo, el selector de fecha en Checkout B2C, Portal B2B y Admin bloquea automáticamente del <strong>{vacConfig.startDate || '—'}</strong> al <strong>{vacConfig.endDate || '—'}</strong> y salta al primer día hábil de retorno sin redirigir chats a WhatsApp.
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })()
                                            ) : setting.key === 'enable_b2b_lead_capture' || setting.key === 'allow_sunday_deliveries' || setting.key === 'allow_holiday_deliveries' || setting.key === 'packaging_fee_enabled' ? (
                                                <select 
                                                    value={setting.value} 
                                                    onChange={(e) => handleUpdateSetting(setting.key, e.target.value)} 
                                                    style={{ 
                                                        width: '100%', 
                                                        padding: '8px 12px', 
                                                        borderRadius: THEME.radius.sm, 
                                                        border: `1px solid ${THEME.colors.borderActive}`, 
                                                        fontWeight: '600', 
                                                        fontSize: '0.85rem',
                                                        color: THEME.colors.textMain,
                                                        backgroundColor: THEME.colors.surface,
                                                        cursor: 'pointer',
                                                        outline: 'none'
                                                    }}
                                                >
                                                    <option value="true">ACTIVADA</option>
                                                    <option value="false">DESACTIVADA</option>
                                                </select>
                                            ) : setting.key === 'packaging_fee_note' ? (
                                                <textarea
                                                    defaultValue={setting.value}
                                                    onBlur={(e) => handleUpdateSetting(setting.key, e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '8px 12px',
                                                        borderRadius: THEME.radius.sm,
                                                        border: `1px solid ${THEME.colors.borderActive}`,
                                                        fontWeight: '500',
                                                        fontSize: '0.8rem',
                                                        color: THEME.colors.textMain,
                                                        outline: 'none',
                                                        minHeight: '60px',
                                                        resize: 'vertical'
                                                    }}
                                                />
                                            ) : (
                                                <div>
                                                    <div style={{ position: 'relative' }}>
                                                        <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontWeight: '600', color: THEME.colors.textSecondary }}>
                                                             {setting.key === 'packaging_fee_percentage' ? '%' : '$'}
                                                        </span>
                                                        <input 
                                                            type="number" 
                                                            defaultValue={setting.value} 
                                                            onBlur={(e) => handleUpdateSetting(setting.key, e.target.value)} 
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.currentTarget.blur();
                                                                }
                                                            }}
                                                            style={{ 
                                                                width: '100%', 
                                                                padding: '8px 8px 8px 25px', 
                                                                borderRadius: THEME.radius.sm, 
                                                                border: `1px solid ${THEME.colors.borderActive}`, 
                                                                fontWeight: '600', 
                                                                color: THEME.colors.textMain, 
                                                                outline: 'none' 
                                                            }} 
                                                        />
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                                                        <span style={{ fontSize: '0.65rem', color: THEME.colors.textSecondary }}>Formato local:</span>
                                                        <span style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.primary }}>
                                                            {setting.key === 'packaging_fee_percentage' ? `${setting.value}%` : formatMoney(parseFloat(setting.value || '0'))}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                    })
                            })()}
                        </div>
                    )}
                </div>

                {/* --- SECCIÓN 2: VARIANTES --- */}
                <div style={{ marginBottom: '1rem' }}>
                    <button 
                        onClick={() => toggleSection('variants')}
                        onMouseEnter={() => setHoveredSection('variants')}
                        onMouseLeave={() => setHoveredSection(null)}
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '12px', 
                            background: THEME.colors.surface, 
                            border: `1px solid ${hoveredSection === 'variants' ? THEME.colors.borderActive : THEME.colors.border}`, 
                            cursor: 'pointer', 
                            width: '100%', 
                            padding: '1.2rem', 
                            borderRadius: THEME.radius.lg, 
                            boxShadow: hoveredSection === 'variants' ? THEME.shadow.md : THEME.shadow.sm,
                            transform: hoveredSection === 'variants' ? 'translateY(-1px)' : 'none',
                            transition: 'all 0.2s ease-in-out' 
                        }}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: THEME.radius.md, backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary }}>
                            <Sliders size={18} strokeWidth={1.5} />
                        </span>
                        <div style={{ textAlign: 'left', flex: 1 }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: THEME.colors.textMain, margin: 0 }}>Gobernanza de Variantes</h2>
                            <p style={{ color: THEME.colors.textSecondary, fontSize: '0.8rem', margin: 0 }}>Control maestro de atributos (Procesos, Madurez, Tamaños).</p>
                        </div>
                        <span style={{ 
                            display: 'flex',
                            alignItems: 'center',
                            color: THEME.colors.textSecondary,
                            transform: openSections.includes('variants') ? 'rotate(180deg)' : 'none', 
                            transition: 'transform 0.2s ease-in-out' 
                        }}>
                            <ChevronDown size={18} strokeWidth={1.5} />
                        </span>
                    </button>
                    {openSections.includes('variants') && (
                        <div style={{ 
                            marginTop: '0.75rem', 
                            padding: '1.2rem', 
                            backgroundColor: '#FAFBFB', 
                            borderRadius: THEME.radius.lg, 
                            border: `1px solid ${THEME.colors.border}`,
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.01)'
                        }}>
                            <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '20px', 
                                backgroundColor: THEME.colors.surface, 
                                padding: '1.2rem', 
                                borderRadius: THEME.radius.md, 
                                border: `1px solid ${THEME.colors.border}`,
                                boxShadow: THEME.shadow.sm
                            }}>
                                <div style={{ 
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '50%',
                                    backgroundColor: THEME.colors.primaryLight,
                                    color: THEME.colors.primary
                                }}>
                                    <Sliders size={20} strokeWidth={1.5} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: THEME.colors.textMain, margin: '0 0 4px 0' }}>Diccionario Maestro de Categorías</h3>
                                    <p style={{ color: THEME.colors.textSecondary, fontSize: '0.75rem', margin: '0 0 8px 0', maxWidth: '500px' }}>
                                        Define las variables globales del catálogo. Estos valores rigen la creación de variantes en todos los productos.
                                    </p>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#DC2626', fontSize: '0.7rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                        <AlertCircle size={14} strokeWidth={1.5} /> 
                                        <span>Precaución: Modificar o borrar variables activas puede afectar la integridad del catálogo.</span>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setShowAttributesModal(true)}
                                    style={{ 
                                        padding: '8px 16px', 
                                        backgroundColor: THEME.colors.primary, 
                                        color: 'white', 
                                        border: 'none', 
                                        borderRadius: THEME.radius.md, 
                                        fontWeight: '600', 
                                        cursor: 'pointer',
                                        fontSize: '0.8rem',
                                        transition: 'background-color 0.2s',
                                        boxShadow: THEME.shadow.sm
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                                >
                                    Gestionar
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* --- SECCIÓN 3: DISEÑO --- */}
                <div style={{ marginBottom: '1rem' }}>
                    <button 
                        onClick={() => toggleSection('design')}
                        onMouseEnter={() => setHoveredSection('design')}
                        onMouseLeave={() => setHoveredSection(null)}
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '12px', 
                            background: THEME.colors.surface, 
                            border: `1px solid ${hoveredSection === 'design' ? THEME.colors.borderActive : THEME.colors.border}`, 
                            cursor: 'pointer', 
                            width: '100%', 
                            padding: '1.2rem', 
                            borderRadius: THEME.radius.lg, 
                            boxShadow: hoveredSection === 'design' ? THEME.shadow.md : THEME.shadow.sm,
                            transform: hoveredSection === 'design' ? 'translateY(-1px)' : 'none',
                            transition: 'all 0.2s ease-in-out' 
                        }}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: THEME.radius.md, backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary }}>
                            <Palette size={18} strokeWidth={1.5} />
                        </span>
                        <div style={{ textAlign: 'left', flex: 1 }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: THEME.colors.textMain, margin: 0 }}>Identidad & Hero</h2>
                            <p style={{ color: THEME.colors.textSecondary, fontSize: '0.8rem', margin: 0 }}>Textos del inicio, banners y propuesta de valor.</p>
                        </div>
                        <span style={{ 
                            display: 'flex',
                            alignItems: 'center',
                            color: THEME.colors.textSecondary,
                            transform: openSections.includes('design') ? 'rotate(180deg)' : 'none', 
                            transition: 'transform 0.2s ease-in-out' 
                        }}>
                            <ChevronDown size={18} strokeWidth={1.5} />
                        </span>
                    </button>
                    {openSections.includes('design') && (
                        <div style={{ 
                            marginTop: '0.75rem', 
                            padding: '1.2rem', 
                            backgroundColor: '#FAFBFB', 
                            borderRadius: THEME.radius.lg, 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '1.2rem',
                            border: `1px solid ${THEME.colors.border}`,
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.01)'
                        }}>
                            {/* Nueva Sección Marca */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '1.2rem' }}>
                                <ImageUpload 
                                    label="Logo Principal" 
                                    description="Navbar y Footer."
                                    value={settings.find(s => s.key === 'app_logo_url')?.value || ''}
                                    onUpload={(url) => handleUpdateSetting('app_logo_url', url)}
                                    onClear={() => handleUpdateSetting('app_logo_url', '')}
                                />
                                <ImageUpload 
                                    label="Logosímbolo (Ops)" 
                                    description="Logo circular pequeño."
                                    value={settings.find(s => s.key === 'app_logosymbol_url')?.value || ''}
                                    onUpload={(url) => handleUpdateSetting('app_logosymbol_url', url)}
                                    onClear={() => handleUpdateSetting('app_logosymbol_url', '')}
                                />
                                <ImageUpload 
                                    label="Imagen del Hero" 
                                    description="Fondo página inicio."
                                    value={settings.find(s => s.key === 'hero_image_url')?.value || ''}
                                    onUpload={(url) => handleUpdateSetting('hero_image_url', url)}
                                    onClear={() => handleUpdateSetting('hero_image_url', '')}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
                                <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.md, padding: '1rem', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textMain, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nombre de la App</h4>
                                    <input type="text" defaultValue={settings.find(s => s.key === 'app_name')?.value || ''} onBlur={(e) => handleUpdateSetting('app_name', e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.borderActive}`, fontWeight: '600', color: THEME.colors.textMain, outline: 'none' }} />
                                </div>
                                <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.md, padding: '1rem', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textMain, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nombre Corto</h4>
                                    <input type="text" defaultValue={settings.find(s => s.key === 'app_short_name')?.value || ''} onBlur={(e) => handleUpdateSetting('app_short_name', e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.borderActive}`, fontWeight: '600', color: THEME.colors.textMain, outline: 'none' }} />
                                </div>
                            </div>

                            {settings.filter(s => ['global_banner', 'hero_title', 'hero_description'].includes(s.key)).map((setting) => (
                                <div key={setting.key} style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.md, padding: '1rem', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textMain, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{setting.description}</h4>
                                    {setting.key === 'hero_description' ? (
                                        <textarea defaultValue={setting.value} onBlur={(e) => handleUpdateSetting(setting.key, e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.borderActive}`, minHeight: '80px', fontFamily: 'inherit', color: THEME.colors.textMain, outline: 'none' }} />
                                    ) : (
                                        <input type="text" defaultValue={setting.value} onBlur={(e) => handleUpdateSetting(setting.key, e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.borderActive}`, fontWeight: '600', color: THEME.colors.textMain, outline: 'none' }} />
                                    )}
                                </div>
                            ))}
                            {/* Pilares integrado aquí */}
                            <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.md, padding: '1rem', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textMain, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Propuesta de Valor (Pilares)</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                                    {JSON.parse(settings.find(s => s.key === 'value_proposition_items')?.value || '[]').map((item: any, idx: number) => (
                                        <div key={idx} style={{ backgroundColor: '#F9FAFB', padding: '1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div>
                                                    <label style={{ fontSize: '0.65rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>Icono (emoji/texto)</label>
                                                    <input type="text" defaultValue={item.icon} style={{ width: '100%', padding: '6px', border: `1px solid ${THEME.colors.borderActive}`, borderRadius: THEME.radius.sm, fontSize: '0.8rem', outline: 'none' }} onBlur={(e) => {
                                                        const current = JSON.parse(settings.find(s => s.key === 'value_proposition_items')?.value || '[]');
                                                        current[idx].icon = e.target.value;
                                                        handleUpdateSetting('value_proposition_items', JSON.stringify(current));
                                                    }} />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.65rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>Título</label>
                                                    <input type="text" defaultValue={item.title} style={{ width: '100%', padding: '6px', border: `1px solid ${THEME.colors.borderActive}`, borderRadius: THEME.radius.sm, fontSize: '0.8rem', fontWeight: '600', outline: 'none' }} onBlur={(e) => {
                                                        const current = JSON.parse(settings.find(s => s.key === 'value_proposition_items')?.value || '[]');
                                                        current[idx].title = e.target.value;
                                                        handleUpdateSetting('value_proposition_items', JSON.stringify(current));
                                                    }} />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.65rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>Descripción</label>
                                                    <textarea defaultValue={item.desc} style={{ width: '100%', padding: '6px', border: `1px solid ${THEME.colors.borderActive}`, borderRadius: THEME.radius.sm, fontSize: '0.75rem', minHeight: '60px', fontFamily: 'inherit', outline: 'none' }} onBlur={(e) => {
                                                        const current = JSON.parse(settings.find(s => s.key === 'value_proposition_items')?.value || '[]');
                                                        current[idx].desc = e.target.value;
                                                        handleUpdateSetting('value_proposition_items', JSON.stringify(current));
                                                    }} />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* --- SECCIÓN 4: B2B --- */}
                <div style={{ marginBottom: '1rem' }}>
                    <button 
                        onClick={() => toggleSection('b2b')}
                        onMouseEnter={() => setHoveredSection('b2b')}
                        onMouseLeave={() => setHoveredSection(null)}
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '12px', 
                            background: THEME.colors.surface, 
                            border: `1px solid ${hoveredSection === 'b2b' ? THEME.colors.borderActive : THEME.colors.border}`, 
                            cursor: 'pointer', 
                            width: '100%', 
                            padding: '1.2rem', 
                            borderRadius: THEME.radius.lg, 
                            boxShadow: hoveredSection === 'b2b' ? THEME.shadow.md : THEME.shadow.sm,
                            transform: hoveredSection === 'b2b' ? 'translateY(-1px)' : 'none',
                            transition: 'all 0.2s ease-in-out' 
                        }}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: THEME.radius.md, backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary }}>
                            <Building2 size={18} strokeWidth={1.5} />
                        </span>
                        <div style={{ textAlign: 'left', flex: 1 }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: THEME.colors.textMain, margin: 0 }}>Módulo B2B / Institucional</h2>
                            <p style={{ color: THEME.colors.textSecondary, fontSize: '0.8rem', margin: 0 }}>Configuración de la página de registro empresarial.</p>
                        </div>
                        <span style={{ 
                            display: 'flex',
                            alignItems: 'center',
                            color: THEME.colors.textSecondary,
                            transform: openSections.includes('b2b') ? 'rotate(180deg)' : 'none', 
                            transition: 'transform 0.2s ease-in-out' 
                        }}>
                            <ChevronDown size={18} strokeWidth={1.5} />
                        </span>
                    </button>
                    {openSections.includes('b2b') && (
                        <div style={{ 
                            marginTop: '0.75rem', 
                            padding: '1.2rem', 
                            backgroundColor: '#FAFBFB', 
                            borderRadius: THEME.radius.lg,
                            border: `1px solid ${THEME.colors.border}`,
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.01)'
                        }}>
                            {(() => {
                                const b2bContent = JSON.parse(settings.find(s => s.key === 'b2b_page_content')?.value || '{}');
                                if (!b2bContent.title) return <p style={{ fontSize: '0.85rem', color: THEME.colors.textSecondary }}>No se pudo cargar el contenido B2B.</p>;
                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
                                            <div>
                                                <label style={{ fontSize: '0.7rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Etiqueta (Badge)</label>
                                                <input type="text" defaultValue={b2bContent.badge} style={{ width: '100%', padding: '8px 12px', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.borderActive}`, outline: 'none', color: THEME.colors.textMain, fontWeight: '600' }} onBlur={(e) => {
                                                    const current = JSON.parse(settings.find(s => s.key === 'b2b_page_content')?.value || '{}');
                                                    current.badge = e.target.value;
                                                    handleUpdateSetting('b2b_page_content', JSON.stringify(current));
                                                }} />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.7rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Título principal</label>
                                                <input type="text" defaultValue={b2bContent.title} style={{ width: '100%', padding: '8px 12px', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.borderActive}`, outline: 'none', color: THEME.colors.textMain, fontWeight: '600' }} onBlur={(e) => {
                                                    const current = JSON.parse(settings.find(s => s.key === 'b2b_page_content')?.value || '{}');
                                                    current.title = e.target.value;
                                                    handleUpdateSetting('b2b_page_content', JSON.stringify(current));
                                                }} />
                                            </div>
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Descripción</label>
                                            <textarea defaultValue={b2bContent.description} style={{ width: '100%', padding: '8px 12px', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.borderActive}`, minHeight: '60px', outline: 'none', color: THEME.colors.textMain, fontFamily: 'inherit' }} onBlur={(e) => {
                                                const current = JSON.parse(settings.find(s => s.key === 'b2b_page_content')?.value || '{}');
                                                current.description = e.target.value;
                                                handleUpdateSetting('b2b_page_content', JSON.stringify(current));
                                            }} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Beneficios Destacados</label>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.8rem' }}>
                                                {b2bContent.benefits.map((b: any, i: number) => (
                                                    <div key={i} style={{ backgroundColor: THEME.colors.surface, padding: '0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                            <input type="text" defaultValue={b.title} style={{ width: '100%', fontSize: '0.75rem', fontWeight: '600', border: `1px solid ${THEME.colors.border}`, borderRadius: THEME.radius.sm, padding: '4px', outline: 'none', color: THEME.colors.textMain }} onBlur={(e) => {
                                                                const current = JSON.parse(settings.find(s => s.key === 'b2b_page_content')?.value || '{}');
                                                                current.benefits[i].title = e.target.value;
                                                                handleUpdateSetting('b2b_page_content', JSON.stringify(current));
                                                            }} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* BLOQUE: ALERTAS E INTELIGENCIA DE PEDIDOS B2B */}
                                        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: `1px dashed ${THEME.colors.border}` }}>
                                            <h3 style={{ fontSize: '0.82rem', fontWeight: '800', color: THEME.colors.textMain, marginBottom: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Sparkles size={16} color={THEME.colors.primary} /> Alertas e Inteligencia de Pedidos B2B
                                            </h3>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
                                                <div>
                                                    <label style={{ fontSize: '0.7rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                                                        Multiplicador Alerta Cantidad Inusual (ej. 3.0x)
                                                    </label>
                                                    <input 
                                                        type="number" 
                                                        step="0.5"
                                                        defaultValue={b2bContent.unusual_qty_multiplier || 3.0} 
                                                        style={{ width: '100%', padding: '8px 12px', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.borderActive}`, outline: 'none', color: THEME.colors.textMain, fontWeight: '700' }} 
                                                        onBlur={(e) => {
                                                            const current = JSON.parse(settings.find(s => s.key === 'b2b_page_content')?.value || '{}');
                                                            current.unusual_qty_multiplier = parseFloat(e.target.value) || 3.0;
                                                            handleUpdateSetting('b2b_page_content', JSON.stringify(current));
                                                        }} 
                                                    />
                                                    <span style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, marginTop: '2px', display: 'block' }}>
                                                        Genera advertencia si la cantidad pedida supera X veces el promedio del cliente
                                                    </span>
                                                </div>

                                                <div>
                                                    <label style={{ fontSize: '0.7rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                                                        Alerta de Insumo Nuevo (Primera Compra)
                                                    </label>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: 'white', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, cursor: 'pointer' }}>
                                                        <input 
                                                            type="checkbox" 
                                                            defaultChecked={b2bContent.enable_new_item_alert !== false} 
                                                            onChange={(e) => {
                                                                const current = JSON.parse(settings.find(s => s.key === 'b2b_page_content')?.value || '{}');
                                                                current.enable_new_item_alert = e.target.checked;
                                                                handleUpdateSetting('b2b_page_content', JSON.stringify(current));
                                                            }} 
                                                        />
                                                        <span style={{ fontSize: '0.78rem', fontWeight: '700', color: THEME.colors.textMain }}>
                                                            Mostrar insignia "Insumo Nuevo" en la canasta
                                                        </span>
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </div>

                {/* --- SECCIÓN 5: CONTACTO --- */}
                <div style={{ marginBottom: '1rem' }}>
                    <button 
                        onClick={() => toggleSection('contact')}
                        onMouseEnter={() => setHoveredSection('contact')}
                        onMouseLeave={() => setHoveredSection(null)}
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '12px', 
                            background: THEME.colors.surface, 
                            border: `1px solid ${hoveredSection === 'contact' ? THEME.colors.borderActive : THEME.colors.border}`, 
                            cursor: 'pointer', 
                            width: '100%', 
                            padding: '1.2rem', 
                            borderRadius: THEME.radius.lg, 
                            boxShadow: hoveredSection === 'contact' ? THEME.shadow.md : THEME.shadow.sm,
                            transform: hoveredSection === 'contact' ? 'translateY(-1px)' : 'none',
                            transition: 'all 0.2s ease-in-out' 
                        }}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: THEME.radius.md, backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary }}>
                            <Phone size={18} strokeWidth={1.5} />
                        </span>
                        <div style={{ textAlign: 'left', flex: 1 }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: THEME.colors.textMain, margin: 0 }}>Contacto & Footer</h2>
                            <p style={{ color: THEME.colors.textSecondary, fontSize: '0.8rem', margin: 0 }}>Información de contacto y textos del pie de página.</p>
                        </div>
                        <span style={{ 
                            display: 'flex',
                            alignItems: 'center',
                            color: THEME.colors.textSecondary,
                            transform: openSections.includes('contact') ? 'rotate(180deg)' : 'none', 
                            transition: 'transform 0.2s ease-in-out' 
                        }}>
                            <ChevronDown size={18} strokeWidth={1.5} />
                        </span>
                    </button>
                    {openSections.includes('contact') && (
                        <div style={{ 
                            marginTop: '0.75rem', 
                            padding: '1.2rem', 
                            backgroundColor: '#FAFBFB', 
                            borderRadius: THEME.radius.lg, 
                            display: 'grid', 
                            gridTemplateColumns: '1fr 1fr', 
                            gap: '1.2rem',
                            border: `1px solid ${THEME.colors.border}`,
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.01)'
                        }}>
                             {settings.filter(s => ['contact_phone', 'contact_email', 'contact_address', 'home_featured_title', 'home_catalog_title', 'footer_description', 'inbox_email_orders', 'inbox_email_commercial'].includes(s.key)).map((setting) => (
                                <div key={setting.key} style={{ 
                                    gridColumn: setting.key === 'footer_description' ? 'span 2' : 'auto', 
                                    backgroundColor: THEME.colors.surface, 
                                    padding: '1rem', 
                                    borderRadius: THEME.radius.md, 
                                    border: `1px solid ${THEME.colors.border}`,
                                    boxShadow: THEME.shadow.sm 
                                }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{setting.description}</label>
                                    <input type="text" defaultValue={setting.value} onBlur={(e) => handleUpdateSetting(setting.key, e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.borderActive}`, outline: 'none', color: THEME.colors.textMain }} />
                                </div>
                             ))}
                        </div>
                    )}
                </div>

                {/* --- SECCIÓN 6: DOCUMENTOS Y MARCA CORPORATIVA --- */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <button 
                        onClick={() => toggleSection('corporate')}
                        onMouseEnter={() => setHoveredSection('corporate')}
                        onMouseLeave={() => setHoveredSection(null)}
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '12px', 
                            background: THEME.colors.surface, 
                            border: `1px solid ${hoveredSection === 'corporate' ? THEME.colors.borderActive : THEME.colors.border}`, 
                            cursor: 'pointer', 
                            width: '100%', 
                            padding: '1.2rem', 
                            borderRadius: THEME.radius.lg, 
                            boxShadow: hoveredSection === 'corporate' ? THEME.shadow.md : THEME.shadow.sm,
                            transform: hoveredSection === 'corporate' ? 'translateY(-1px)' : 'none',
                            transition: 'all 0.2s ease-in-out' 
                        }}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: THEME.radius.md, backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary }}>
                            <FileText size={18} strokeWidth={1.5} />
                        </span>
                        <div style={{ textAlign: 'left', flex: 1 }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: THEME.colors.textMain, margin: 0 }}>Empresa y Documentos</h2>
                            <p style={{ color: THEME.colors.textSecondary, fontSize: '0.8rem', margin: 0 }}>NIT, colores corporativos y configuración para cotizaciones/facturas.</p>
                        </div>
                        <span style={{ 
                            display: 'flex',
                            alignItems: 'center',
                            color: THEME.colors.textSecondary,
                            transform: openSections.includes('corporate') ? 'rotate(180deg)' : 'none', 
                            transition: 'transform 0.2s ease-in-out' 
                        }}>
                            <ChevronDown size={18} strokeWidth={1.5} />
                        </span>
                    </button>
                    {openSections.includes('corporate') && (
                        <div style={{ 
                            marginTop: '0.75rem', 
                            padding: '1.2rem', 
                            backgroundColor: '#FAFBFB', 
                            borderRadius: THEME.radius.lg, 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '1.2rem',
                            border: `1px solid ${THEME.colors.border}`,
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.01)'
                        }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '1.2rem' }}>
                                {/* Legal / Company Details */}
                                <div style={{ backgroundColor: THEME.colors.surface, padding: '1.2rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div>
                                        <h4 style={{ margin: '0 0 6px 0', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textMain, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Razón Social (Emisor)</h4>
                                        <input 
                                            type="text" 
                                            defaultValue={settings.find(s => s.key === 'provider_legal_name')?.value || ''} 
                                            onBlur={(e) => handleUpdateSetting('provider_legal_name', e.target.value)} 
                                            style={{ width: '100%', padding: '8px 12px', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.borderActive}`, fontWeight: '600', color: THEME.colors.textMain, outline: 'none' }} 
                                        />
                                    </div>
                                    <div>
                                        <h4 style={{ margin: '0 0 6px 0', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textMain, textTransform: 'uppercase', letterSpacing: '0.05em' }}>NIT / CC</h4>
                                        <input 
                                            type="text" 
                                            defaultValue={settings.find(s => s.key === 'provider_nit')?.value || ''} 
                                            onBlur={(e) => handleUpdateSetting('provider_nit', e.target.value)} 
                                            style={{ width: '100%', padding: '8px 12px', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.borderActive}`, fontWeight: '600', color: THEME.colors.textMain, outline: 'none' }} 
                                        />
                                    </div>
                                </div>
                                <div style={{ height: '100%' }}>
                                    <ImageUpload 
                                        label="Logo Legal para Documentos" 
                                        description="Sobre-escribe el logo del navbar específicamente para PDF's"
                                        value={settings.find(s => s.key === 'provider_logo_url')?.value || ''}
                                        onUpload={(url) => handleUpdateSetting('provider_logo_url', url)}
                                        onClear={() => handleUpdateSetting('provider_logo_url', '')}
                                    />
                                </div>
                            </div>
                            
                            {/* Color settings */}
                            <div style={{ backgroundColor: THEME.colors.surface, padding: '1.2rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textMain, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Colores Dinámicos (Documentos)</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <input 
                                            type="color" 
                                            defaultValue={settings.find(s => s.key === 'primary_color')?.value || '#0891B2'} 
                                            onBlur={(e) => handleUpdateSetting('primary_color', e.target.value)} 
                                            style={{ width: '48px', height: '48px', cursor: 'pointer', border: `1px solid ${THEME.colors.borderActive}`, padding: '2px', borderRadius: THEME.radius.sm, backgroundColor: 'white' }} 
                                        />
                                        <div>
                                            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: THEME.colors.textMain, display: 'block' }}>Color Primario</label>
                                            <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary }}>{settings.find(s => s.key === 'primary_color')?.value || '#0891B2'}</span>
                                        </div>
                                    </div>
                                    
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <input 
                                            type="color" 
                                            defaultValue={settings.find(s => s.key === 'secondary_color')?.value || '#10B981'} 
                                            onBlur={(e) => handleUpdateSetting('secondary_color', e.target.value)} 
                                            style={{ width: '48px', height: '48px', cursor: 'pointer', border: `1px solid ${THEME.colors.borderActive}`, padding: '2px', borderRadius: THEME.radius.sm, backgroundColor: 'white' }} 
                                        />
                                        <div>
                                            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: THEME.colors.textMain, display: 'block' }}>Color Secundario</label>
                                            <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary }}>{settings.find(s => s.key === 'secondary_color')?.value || '#10B981'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ 
                    marginTop: '3rem', 
                    padding: '1.2rem', 
                    backgroundColor: THEME.colors.primaryLight, 
                    borderRadius: THEME.radius.lg, 
                    border: `1px solid ${THEME.colors.border}`, 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                }}>
                    <div style={{ color: THEME.colors.primary, display: 'flex', alignItems: 'center' }}>
                        <Lightbulb size={20} strokeWidth={1.5} />
                    </div>
                    <p style={{ fontSize: '0.8rem', color: THEME.colors.textMain, margin: 0, textAlign: 'left', lineHeight: '1.4' }}>
                        <strong>Tip operativo:</strong> Los ajustes operativos del día a día se gestionan aquí. Para cambios estructurales contacta al Chief Engineer.
                    </p>
                </div>
                </div>

                <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes spin { to { transform: rotate(360deg); } }
                    @keyframes slideDown { 
                        from { opacity: 0; transform: translateY(-10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                ` }} />
            </div>
        </main>
    );
}
