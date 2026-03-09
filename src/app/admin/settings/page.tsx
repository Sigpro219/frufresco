'use client';

import { useState, useEffect } from 'react';
import { supabase, verifyConnectivity } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Toast from '@/components/Toast';
import Link from 'next/link';
import { diagnoseStorageError } from '@/lib/errorUtils';

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
        <div style={{ backgroundColor: 'white', borderRadius: '15px', padding: '1.2rem', border: '1px solid #E5E7EB' }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '0.75rem', fontWeight: '900', color: '#111827', textTransform: 'uppercase' }}>{label}</h4>
            {description && <p style={{ margin: '0 0 12px 0', fontSize: '0.7rem', color: '#6B7280' }}>{description}</p>}
            
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                {value ? (
                    <div style={{ position: 'relative', width: '100px', height: '100px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
                        <img src={value} alt={label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        <button 
                            onClick={(e) => { e.preventDefault(); onClear(); }}
                            style={{ position: 'absolute', top: '4px', right: '4px', backgroundColor: 'rgba(239, 68, 68, 0.9)', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            ×
                        </button>
                    </div>
                ) : (
                    <div style={{ width: '100px', height: '100px', borderRadius: '12px', border: '2px dashed #D1D5DB', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB', color: '#9CA3AF', fontSize: '1.5rem' }}>
                        🖼️
                    </div>
                )}
                
                <div style={{ flex: 1 }}>
                    <label style={{ 
                        display: 'inline-block', 
                        padding: '8px 16px', 
                        backgroundColor: uploading ? '#9CA3AF' : '#111827', 
                        color: 'white', 
                        borderRadius: '8px', 
                        cursor: uploading ? 'not-allowed' : 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: '700',
                        transition: 'all 0.2s'
                    }}>
                        {uploading ? 'Subiendo...' : value ? 'Cambiar Imagen' : 'Subir Imagen'}
                        <input type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} style={{ display: 'none' }} />
                    </label>
                    <p style={{ margin: '8px 0 0 0', fontSize: '0.65rem', color: '#9CA3AF' }}>PNG, JPG o WEBP. Máx 2MB.</p>
                </div>
            </div>
        </div>
    );
}

export default function AdminSettingsPage() {
    const [settings, setSettings] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);
    const [persisted, setPersisted] = useState(false);
    const [openSections, setOpenSections] = useState<string[]>(['operation']); // Por defecto abre Operación
    const [connStatus, setConnStatus] = useState<{ ok: boolean, latency?: string, storageOk?: boolean, checked: boolean, checking: boolean }>({
        ok: true, checked: false, checking: false
    });

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
            { key: 'hero_image_url', value: '', description: 'URL de la imagen de fondo del Hero principal' },
            { key: 'app_name', value: 'FruFresco', description: 'Nombre oficial de la aplicación (SEO)' },
            { key: 'app_short_name', value: 'FruFresco', description: 'Nombre corto (Navbar/Mobile)' }
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
        <main style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', fontFamily: 'Inter, sans-serif' }}>
            <Navbar />
            <Toast />
            <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem' }}>
                <Link href="/admin/dashboard" style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: '#6B7280',
                    textDecoration: 'none', fontWeight: '600', marginBottom: '1rem', fontSize: '0.9rem'
                }}>
                    ← Volver al Dashboard
                </Link>

                <header style={{ marginBottom: '2.5rem' }}>
                    <h1 style={{ fontSize: '2.2rem', fontWeight: '900', color: '#111827', margin: 0 }}>Gobernanza del Sistema</h1>
                    <p style={{ color: '#6B7280', marginTop: '0.5rem' }}>Control Maestro de parámetros globales.</p>
                </header>

                {/* --- CONNECTIVITY CHECKER --- */}
                <div style={{ 
                    marginBottom: '2rem', 
                    padding: '1rem 1.5rem', 
                    backgroundColor: connStatus.checked ? (connStatus.ok && connStatus.storageOk ? '#ECFDF5' : '#FEF2F2') : '#F3F4F6',
                    borderRadius: '16px',
                    border: `1px solid ${connStatus.checked ? (connStatus.ok && connStatus.storageOk ? '#10B981' : '#EF4444') : '#E5E7EB'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ 
                            width: '12px', 
                            height: '12px', 
                            borderRadius: '50%', 
                            backgroundColor: connStatus.checked ? (connStatus.ok && connStatus.storageOk ? '#10B981' : '#EF4444') : '#9CA3AF',
                            boxShadow: connStatus.checked && connStatus.ok ? '0 0 8px #10B981' : 'none'
                        }} />
                        <div>
                            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: '800', color: '#111827' }}>
                                {connStatus.checking ? 'Verificando enlace...' : 
                                 !connStatus.checked ? 'No se ha verificado la conexión' :
                                 connStatus.ok && connStatus.storageOk ? 'Sistemas Operativos' :
                                 !connStatus.ok ? 'Error de Conexión Base' : 'Error en Almacenamiento'}
                            </p>
                            {connStatus.checked && (
                                <p style={{ margin: 0, fontSize: '0.7rem', color: '#6B7280' }}>
                                    {connStatus.ok ? `Latencia: ${connStatus.latency} | Storage: ${connStatus.storageOk ? 'OK' : 'FAIL'}` : 'Verifica tu conexión o bloqueadores'}
                                </p>
                            )}
                        </div>
                    </div>
                    <button 
                        onClick={checkHealth}
                        disabled={connStatus.checking}
                        style={{
                            padding: '6px 14px',
                            backgroundColor: 'white',
                            border: '1px solid #D1D5DB',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            cursor: connStatus.checking ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}>
                        {connStatus.checking ? '⏳...' : '🧪 Probar Conexión'}
                    </button>
                </div>

                {/* --- SECCIÓN 1: OPERACIÓN --- */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <button 
                        onClick={() => toggleSection('operation')}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'white', border: '1px solid #E5E7EB', cursor: 'pointer', width: '100%', padding: '1.2rem', borderRadius: '16px', transition: 'all 0.2s' }}>
                        <span style={{ fontSize: '1.5rem' }}>⚙️</span>
                        <div style={{ textAlign: 'left', flex: 1 }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: '900', color: '#111827', margin: 0 }}>Operación de Tienda</h2>
                            <p style={{ color: '#6B7280', fontSize: '0.8rem', margin: 0 }}>Estados, pedidos mínimos y costos operativos.</p>
                        </div>
                        <span style={{ transform: openSections.includes('operation') ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>▼</span>
                    </button>
                    {openSections.includes('operation') && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1rem', padding: '1rem', backgroundColor: '#F9FAFB', borderRadius: '16px' }}>
                            {settings.filter(s => ['store_status', 'delivery_fee', 'min_order_hogar', 'min_order_institucional', 'enable_b2b_lead_capture', 'enable_cutoff_rules'].includes(s.key)).map((setting) => (
                                <div key={setting.key} style={{ 
                                    backgroundColor: 'white', 
                                    borderRadius: '15px', 
                                    padding: '1rem', 
                                    border: '1px solid #E5E7EB',
                                    gridColumn: 'auto'
                                }}>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: '900', color: '#111827', textTransform: 'uppercase' }}>
                                        {setting.key === 'delivery_fee' ? 'Costo de Envío' :
                                         setting.key === 'min_order_hogar' ? 'Mínimo Hogar' :
                                         setting.key === 'min_order_institucional' ? 'Mínimo Institucional' :
                                         setting.key === 'store_status' ? 'Estado Tienda' :
                                         setting.key === 'enable_b2b_lead_capture' ? 'Captura Leads B2B' :
                                         setting.key === 'enable_cutoff_rules' ? '⏱️ Reglas Hora de Corte (5 PM)' :
                                         setting.key === 'picking_route_spaces' ? 'Asignación de Espacios por Ruta (JSON)' :
                                         setting.key.replace(/_/g, ' ')}
                                    </h4>
                                    {setting.key === 'store_status' || setting.key === 'enable_b2b_lead_capture' || setting.key === 'enable_cutoff_rules' ? (
                                        <select value={setting.value} onChange={(e) => handleUpdateSetting(setting.key, e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #D1D5DB', fontWeight: '700' }}>
                                            <option value={setting.key === 'store_status' ? "open" : "true"}>{setting.key === 'store_status' ? "ABIERTA" : "ACTIVADA"}</option>
                                            <option value={setting.key === 'store_status' ? "closed" : "false"}>{setting.key === 'store_status' ? "CERRADA" : "DESACTIVADA"}</option>
                                        </select>
                                    ) : setting.key === 'picking_route_spaces' ? (
                                        <textarea 
                                            defaultValue={setting.value} 
                                            onBlur={(e) => handleUpdateSetting(setting.key, e.target.value)}
                                            rows={4}
                                            style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #D1D5DB', fontWeight: '500', fontFamily: 'monospace', fontSize: '0.8rem' }}
                                        />
                                    ) : (
                                        <div style={{ position: 'relative' }}>
                                            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontWeight: '900', color: '#6B7280' }}>$</span>
                                            <input type="number" defaultValue={setting.value} onBlur={(e) => handleUpdateSetting(setting.key, e.target.value)} style={{ width: '100%', padding: '8px 8px 8px 25px', borderRadius: '8px', border: '1px solid #D1D5DB', fontWeight: '900' }} />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* --- SECCIÓN 2: DISEÑO --- */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <button 
                        onClick={() => toggleSection('design')}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'white', border: '1px solid #E5E7EB', cursor: 'pointer', width: '100%', padding: '1.2rem', borderRadius: '16px', transition: 'all 0.2s' }}>
                        <span style={{ fontSize: '1.5rem' }}>🎨</span>
                        <div style={{ textAlign: 'left', flex: 1 }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: '900', color: '#111827', margin: 0 }}>Identidad & Hero</h2>
                            <p style={{ color: '#6B7280', fontSize: '0.8rem', margin: 0 }}>Textos del inicio, banners y propuesta de valor.</p>
                        </div>
                        <span style={{ transform: openSections.includes('design') ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>▼</span>
                    </button>
                    {openSections.includes('design') && (
                        <div style={{ marginTop: '1rem', padding: '1.5rem', backgroundColor: '#F9FAFB', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {/* Nueva Sección Marca */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem' }}>
                                <ImageUpload 
                                    label="Logo Principal" 
                                    description="Navbar y Footer."
                                    value={settings.find(s => s.key === 'app_logo_url')?.value || ''}
                                    onUpload={(url) => handleUpdateSetting('app_logo_url', url)}
                                    onClear={() => handleUpdateSetting('app_logo_url', '')}
                                />
                                <ImageUpload 
                                    label="Logosímbolo (Ops)" 
                                    description="Logo circular pequeño para portales internos."
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

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div style={{ backgroundColor: 'white', borderRadius: '15px', padding: '1.2rem', border: '1px solid #E5E7EB' }}>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: '900', color: '#111827', textTransform: 'uppercase' }}>Nombre de la App</h4>
                                    <input type="text" defaultValue={settings.find(s => s.key === 'app_name')?.value || ''} onBlur={(e) => handleUpdateSetting('app_name', e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #D1D5DB', fontWeight: '600' }} />
                                </div>
                                <div style={{ backgroundColor: 'white', borderRadius: '15px', padding: '1.2rem', border: '1px solid #E5E7EB' }}>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: '900', color: '#111827', textTransform: 'uppercase' }}>Nombre Corto</h4>
                                    <input type="text" defaultValue={settings.find(s => s.key === 'app_short_name')?.value || ''} onBlur={(e) => handleUpdateSetting('app_short_name', e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #D1D5DB', fontWeight: '600' }} />
                                </div>
                            </div>

                            {settings.filter(s => ['global_banner', 'hero_title', 'hero_description'].includes(s.key)).map((setting) => (
                                <div key={setting.key} style={{ backgroundColor: 'white', borderRadius: '15px', padding: '1.2rem', border: '1px solid #E5E7EB' }}>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: '900', color: '#111827', textTransform: 'uppercase' }}>{setting.description}</h4>
                                    {setting.key === 'hero_description' ? (
                                        <textarea defaultValue={setting.value} onBlur={(e) => handleUpdateSetting(setting.key, e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #D1D5DB', minHeight: '80px', fontFamily: 'inherit' }} />
                                    ) : (
                                        <input type="text" defaultValue={setting.value} onBlur={(e) => handleUpdateSetting(setting.key, e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #D1D5DB', fontWeight: '600' }} />
                                    )}
                                </div>
                            ))}
                            {/* Pilares integrado aquí */}
                            <div style={{ backgroundColor: 'white', borderRadius: '15px', padding: '1.2rem', border: '1px solid #E5E7EB' }}>
                                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.75rem', fontWeight: '900', color: '#111827', textTransform: 'uppercase' }}>Propuesta de Valor (Pilares)</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                                    {JSON.parse(settings.find(s => s.key === 'value_proposition_items')?.value || '[]').map((item: any, idx: number) => (
                                        <div key={idx} style={{ backgroundColor: '#F9FAFB', padding: '1rem', borderRadius: '12px' }}>
                                            <input type="text" defaultValue={item.icon} style={{ width: '100%', textAlign: 'center', marginBottom: '8px', border: '1px solid #DDD', borderRadius: '4px' }} onBlur={(e) => {
                                                const current = JSON.parse(settings.find(s => s.key === 'value_proposition_items')?.value || '[]');
                                                current[idx].icon = e.target.value;
                                                handleUpdateSetting('value_proposition_items', JSON.stringify(current));
                                            }} />
                                            <input type="text" defaultValue={item.title} style={{ width: '100%', fontWeight: '700', fontSize: '0.8rem', marginBottom: '4px', border: '1px solid #DDD', borderRadius: '4px' }} onBlur={(e) => {
                                                const current = JSON.parse(settings.find(s => s.key === 'value_proposition_items')?.value || '[]');
                                                current[idx].title = e.target.value;
                                                handleUpdateSetting('value_proposition_items', JSON.stringify(current));
                                            }} />
                                            <textarea defaultValue={item.desc} style={{ width: '100%', fontSize: '0.7rem', minHeight: '40px', border: '1px solid #DDD', borderRadius: '4px' }} onBlur={(e) => {
                                                const current = JSON.parse(settings.find(s => s.key === 'value_proposition_items')?.value || '[]');
                                                current[idx].desc = e.target.value;
                                                handleUpdateSetting('value_proposition_items', JSON.stringify(current));
                                            }} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* --- SECCIÓN 3: B2B --- */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <button 
                        onClick={() => toggleSection('b2b')}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'white', border: '1px solid #E5E7EB', cursor: 'pointer', width: '100%', padding: '1.2rem', borderRadius: '16px', transition: 'all 0.2s' }}>
                        <span style={{ fontSize: '1.5rem' }}>🏢</span>
                        <div style={{ textAlign: 'left', flex: 1 }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: '900', color: '#111827', margin: 0 }}>Módulo B2B / Institucional</h2>
                            <p style={{ color: '#6B7280', fontSize: '0.8rem', margin: 0 }}>Configuración de la página de registro empresarial.</p>
                        </div>
                        <span style={{ transform: openSections.includes('b2b') ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>▼</span>
                    </button>
                    {openSections.includes('b2b') && (
                        <div style={{ marginTop: '1rem', padding: '1.5rem', backgroundColor: '#F9FAFB', borderRadius: '16px' }}>
                            {(() => {
                                const b2bContent = JSON.parse(settings.find(s => s.key === 'b2b_page_content')?.value || '{}');
                                if (!b2bContent.title) return <p>No se pudo cargar el contenido B2B.</p>;
                                return (
                                    <>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                            <div>
                                                <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280' }}>ETIQUETA</label>
                                                <input type="text" defaultValue={b2bContent.badge} style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #D1D5DB' }} onBlur={(e) => {
                                                    const current = JSON.parse(settings.find(s => s.key === 'b2b_page_content')?.value || '{}');
                                                    current.badge = e.target.value;
                                                    handleUpdateSetting('b2b_page_content', JSON.stringify(current));
                                                }} />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280' }}>TÍTULO</label>
                                                <input type="text" defaultValue={b2bContent.title} style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #D1D5DB' }} onBlur={(e) => {
                                                    const current = JSON.parse(settings.find(s => s.key === 'b2b_page_content')?.value || '{}');
                                                    current.title = e.target.value;
                                                    handleUpdateSetting('b2b_page_content', JSON.stringify(current));
                                                }} />
                                            </div>
                                        </div>
                                        <textarea defaultValue={b2bContent.description} style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #D1D5DB', minHeight: '60px', marginBottom: '1rem' }} onBlur={(e) => {
                                            const current = JSON.parse(settings.find(s => s.key === 'b2b_page_content')?.value || '{}');
                                            current.description = e.target.value;
                                            handleUpdateSetting('b2b_page_content', JSON.stringify(current));
                                        }} />
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                                            {b2bContent.benefits.map((b: any, i: number) => (
                                                <div key={i} style={{ backgroundColor: 'white', padding: '0.5rem', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                                                    <input type="text" defaultValue={b.icon} style={{ width: '100%', textAlign: 'center', fontSize: '1rem', border: 'none' }} onBlur={(e) => {
                                                        const current = JSON.parse(settings.find(s => s.key === 'b2b_page_content')?.value || '{}');
                                                        current.benefits[i].icon = e.target.value;
                                                        handleUpdateSetting('b2b_page_content', JSON.stringify(current));
                                                    }} />
                                                    <input type="text" defaultValue={b.title} style={{ width: '100%', fontSize: '0.7rem', fontWeight: 'bold', border: 'none' }} onBlur={(e) => {
                                                        const current = JSON.parse(settings.find(s => s.key === 'b2b_page_content')?.value || '{}');
                                                        current.benefits[i].title = e.target.value;
                                                        handleUpdateSetting('b2b_page_content', JSON.stringify(current));
                                                    }} />
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </div>

                {/* --- SECCIÓN 4: CONTACTO --- */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <button 
                        onClick={() => toggleSection('contact')}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'white', border: '1px solid #E5E7EB', cursor: 'pointer', width: '100%', padding: '1.2rem', borderRadius: '16px', transition: 'all 0.2s' }}>
                        <span style={{ fontSize: '1.5rem' }}>📞</span>
                        <div style={{ textAlign: 'left', flex: 1 }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: '900', color: '#111827', margin: 0 }}>Contacto & Footer</h2>
                            <p style={{ color: '#6B7280', fontSize: '0.8rem', margin: 0 }}>Información de contacto y textos legales del pie de página.</p>
                        </div>
                        <span style={{ transform: openSections.includes('contact') ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>▼</span>
                    </button>
                    {openSections.includes('contact') && (
                        <div style={{ marginTop: '1rem', padding: '1.5rem', backgroundColor: '#F9FAFB', borderRadius: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
                             {settings.filter(s => ['contact_phone', 'contact_email', 'contact_address', 'home_featured_title', 'home_catalog_title', 'footer_description'].includes(s.key)).map((setting) => (
                                <div key={setting.key} style={{ gridColumn: setting.key === 'footer_description' ? 'span 2' : 'auto', backgroundColor: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '900', color: '#6B7280', display: 'block', marginBottom: '4px' }}>{setting.description}</label>
                                    <input type="text" defaultValue={setting.value} onBlur={(e) => handleUpdateSetting(setting.key, e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #D1D5DB' }} />
                                </div>
                             ))}
                        </div>
                    )}
                </div>

                <div style={{ marginTop: '3rem', padding: '1.5rem', backgroundColor: '#EFF6FF', borderRadius: '16px', border: '1px solid #DBEAFE', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.85rem', color: '#1E40AF', margin: 0 }}>
                        💡 <strong>TIP:</strong> Los ajustes operativos del día a día se gestionan aquí. Para cambios estructurales contacta al Chief Engineer.
                    </p>
                </div>

                <style jsx global>{`
                    @keyframes spin { to { transform: rotate(360deg); } }
                    @keyframes slideDown { 
                        from { opacity: 0; transform: translateY(-10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}</style>
            </div>
        </main>
    );
}
