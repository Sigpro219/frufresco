'use client';

import { useState, useEffect } from 'react';
import { supabase, verifyConnectivity } from '@/lib/supabase';
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
    Save
} from 'lucide-react';

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
    const [settings, setSettings] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);
    const [persisted, setPersisted] = useState(false);
    const [openSections, setOpenSections] = useState<string[]>(['operation']); 
    const [showAttributesModal, setShowAttributesModal] = useState(false);
    const [connStatus, setConnStatus] = useState<{ ok: boolean, latency?: string, storageOk?: boolean, checked: boolean, checking: boolean }>({
        ok: true, checked: false, checking: false
    });
    const [hoveredSection, setHoveredSection] = useState<string | null>(null);

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
            (window as any).showToast?.('⚠️ Error de conexión: ' + result.error, 'error');
        } else if (!result.storageOk) {
            (window as any).showToast?.('⚠️ Base de datos OK, pero Storage no responde', 'warning');
        } else {
            (window as any).showToast?.('⚡ Conexión exitosa (' + result.latency + ')', 'success');
        }
    };

    const toggleSection = (id: string) => {
        setOpenSections(prev => 
            prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
        );
    };

    const fetchSettings = async () => {
        const { data, error } = await supabase
            .from('app_settings')
            .select('*')
            .order('key');

        const defaultSettings = [
            { key: 'delivery_fee', value: '5000', description: 'Costo de envío estándar' },
            { key: 'min_order_hogar', value: '30000', description: 'Pedido mínimo para la Línea Hogar' },
            { key: 'min_order_institucional', value: '150000', description: 'Pedido mínimo para la Línea Institucional' },
            { key: 'enable_cutoff_rules', value: 'true', description: 'Habilitar Reglas de Hora de Corte (Desactivar para Pruebas)' },
            { key: 'enable_b2b_lead_capture', value: 'true', description: 'Canal de registro para nuevos clientes institucionales (B2B)' },
            { key: 'hero_title', value: 'Excelencia en Frescura \n para tu Negocio y Hogar', description: 'Título principal del banner de inicio' },
            { key: 'hero_description', value: 'Somos el aliado estratégico de los mejores restaurantes y casinos de Bogotá. Llevamos la calidad de Corabastos a tu puerta, con cero desperdicio y puntualidad suiza.', description: 'Texto secundario del banner de inicio' },
            { 
              key: 'value_proposition_items', 
              value: JSON.stringify([
                { icon: '⏱️', title: 'Entrega Puntual', desc: 'Tu operación no puede detenerse. Garantizamos entregas antes de la apertura de tu cocina.' },
                { icon: '🥬', title: 'Frescura Absoluta', desc: 'Seleccionamos producto a producto cada madrugada. Lo que recibes hoy, se cosechó ayer.' },
                { icon: '💎', title: 'Precios Competitivos', desc: 'Sin intermediarios innecesarios. Optimizamos la cadena para darte el mejor margen.' }
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
                        { icon: '🚀', title: 'Entrega AM', desc: 'Todo listo antes de abrir cocina.' },
                        { icon: '💰', title: 'Precios Justos', desc: 'Ahorro directo sin intermediarios.' },
                        { icon: '🥕', title: 'Frescura Total', desc: 'Cosechado ayer, entregado hoy.' },
                        { icon: '💳', title: 'Crédito B2B', desc: 'Paga a 15 o 30 días fácil.' }
                    ]
                }), 
                description: 'Contenido dinámico de la página de registro B2B' 
            },
            { key: 'store_status', value: 'open', description: 'Estado actual de la tienda (Abierto/Cerrado)' },
            { key: 'global_banner', value: '', description: 'Anuncio superior (ej: ¡Envíos gratis hoy!)' },
            { key: 'home_featured_title', value: '🔥 Lo más vendido de la semana', description: 'Título sección productos destacados' },
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
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const handleUpdateSetting = async (key: string, newValue: string) => {
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
                        console.log('✅ Registro de Flota actualizado proactivamente');
                    }
                } catch (fleetErr) {
                    // Silencioso si falla (en tenantes hijos la tabla no existe)
                    console.warn('💡 Entorno independiente (Hijo) o sin tabla de flota. Sincronización maestro omitida.', fleetErr);
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
            (window as any).showToast?.('Cambio guardado ✓', 'success');
        }
        setSaving(false);
    };

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: 'Inter, sans-serif' }}>
            <Toast />
            {showAttributesModal && <ManageAttributesModal onClose={() => setShowAttributesModal(false)} />}
            <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>
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
                    <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.02em' }}>Gobernanza del Sistema</h1>
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
                            {settings.filter(s => ['store_status', 'delivery_fee', 'min_order_hogar', 'min_order_institucional', 'enable_b2b_lead_capture', 'enable_cutoff_rules'].includes(s.key)).map((setting) => (
                                <div key={setting.key} style={{ 
                                    backgroundColor: THEME.colors.surface, 
                                    borderRadius: THEME.radius.md, 
                                    padding: '1rem', 
                                    border: `1px solid ${THEME.colors.border}`,
                                    boxShadow: THEME.shadow.sm
                                }}>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textMain, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {setting.key === 'delivery_fee' ? 'Costo de Envío' :
                                         setting.key === 'min_order_hogar' ? 'Mínimo Hogar' :
                                         setting.key === 'min_order_institucional' ? 'Mínimo Institucional' :
                                         setting.key === 'store_status' ? 'Estado Tienda' :
                                         setting.key === 'enable_b2b_lead_capture' ? 'Captura Leads B2B' :
                                         setting.key === 'enable_cutoff_rules' ? 'Reglas Hora de Corte (5 PM)' :
                                         setting.key.replace(/_/g, ' ')}
                                    </h4>
                                    {setting.key === 'store_status' || setting.key === 'enable_b2b_lead_capture' || setting.key === 'enable_cutoff_rules' ? (
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
                                            <option value={setting.key === 'store_status' ? "open" : "true"}>{setting.key === 'store_status' ? "ABIERTA" : "ACTIVADA"}</option>
                                            <option value={setting.key === 'store_status' ? "closed" : "false"}>{setting.key === 'store_status' ? "CERRADA" : "DESACTIVADA"}</option>
                                        </select>
                                    ) : (
                                        <div>
                                            <div style={{ position: 'relative' }}>
                                                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontWeight: '600', color: THEME.colors.textSecondary }}>$</span>
                                                <input 
                                                    type="number" 
                                                    defaultValue={setting.value} 
                                                    onBlur={(e) => handleUpdateSetting(setting.key, e.target.value)} 
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
                                                    {formatMoney(parseFloat(setting.value || '0'))}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
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
                                                            <input type="text" defaultValue={b.icon} style={{ width: '100%', textAlign: 'center', fontSize: '1rem', border: `1px solid ${THEME.colors.border}`, borderRadius: THEME.radius.sm, padding: '4px', outline: 'none' }} onBlur={(e) => {
                                                                const current = JSON.parse(settings.find(s => s.key === 'b2b_page_content')?.value || '{}');
                                                                current.benefits[i].icon = e.target.value;
                                                                handleUpdateSetting('b2b_page_content', JSON.stringify(current));
                                                            }} />
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
                             {settings.filter(s => ['contact_phone', 'contact_email', 'contact_address', 'home_featured_title', 'home_catalog_title', 'footer_description'].includes(s.key)).map((setting) => (
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
