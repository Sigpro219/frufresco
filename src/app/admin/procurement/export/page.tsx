'use client';

import { useState, useEffect } from 'react';
import { 
    FileSpreadsheet, 
    Download, 
    ChevronRight, 
    Calendar, 
    CheckCircle2, 
    AlertCircle, 
    Clock, 
    Filter,
    ArrowLeft,
    Layers,
    Database,
    Cpu,
    Users
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { THEME } from '@/lib/adminTheme';

export default function WorldOfficeExportPage() {
    const [mounted, setMounted] = useState(false);
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<{msg: string, type: 'info' | 'success' | 'error'}[]>([]);
    const [exportType, setExportType] = useState<'cuts' | 'cash' | 'expenses' | 'providers'>('cuts');
    const [dateRange, setDateRange] = useState({ start: new Date().toISOString().split('T')[0], end: new Date().toISOString().split('T')[0] });

    useEffect(() => {
        setMounted(true);
    }, []);

    const addLog = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
        setLogs(prev => [...prev, { msg, type }]);
    };

    const handleExport = async () => {
        setLoading(true);
        setLogs([]);
        addLog(`Iniciando exportación de ${exportType.toUpperCase()}...`, 'info');

        try {
            let data: any[] = [];
            
            if (exportType === 'cuts') {
                addLog('Consultando cortes de facturación activos...', 'info');
                const { data: cuts, error } = await supabase
                    .from('order_items')
                    .select(`
                        id, quantity, unit_price, nickname,
                        orders!inner(id, billing_cut_id, sequence_id, profiles(nit, company_name)),
                        products(sku, name, category)
                    `)
                    .gte('orders.created_at', dateRange.start)
                    .lte('orders.created_at', dateRange.end);
                
                if (error) throw error;
                data = cuts || [];
            } else if (exportType === 'cash') {
                addLog('Consultando compras de contado (Corabastos)...', 'info');
                const { data: purchases, error } = await supabase
                    .from('purchases')
                    .select(`
                        *,
                        product:products(sku, name),
                        provider:providers(nit, name)
                    `)
                    .eq('payment_method', 'cash')
                    .gte('created_at', dateRange.start)
                    .lte('created_at', dateRange.end);
                
                if (error) throw error;
                data = purchases || [];
            } else if (exportType === 'providers') {
                addLog('Generando maestro de proveedores...', 'info');
                const { data: providers, error } = await supabase
                    .from('providers')
                    .select('*');
                if (error) throw error;
                data = providers || [];
            } else {
                addLog('Consultando gastos operativos y fijos...', 'info');
                const { data: exp, error } = await supabase
                    .from('cash_movements')
                    .select('*')
                    .eq('type', 'expense')
                    .gte('created_at', dateRange.start)
                    .lte('created_at', dateRange.end);
                if (error) throw error;
                data = exp || [];
            }

            if (data.length === 0) {
                addLog('No se encontraron registros para el rango seleccionado.', 'error');
                setLoading(false);
                return;
            }

            addLog(`Procesando ${data.length} registros para formato de 50 columnas...`, 'info');

            // --- WORLD OFFICE 50-COLUMN MAPPING ---
            const woData = data.map((item, index) => {
                const row: any = {};
                
                const columns = [
                    'TipoDocumento', 'Prefijo', 'Numero', 'Fecha', 'NitTercero', 'NombreTercero', 
                    'CodigoProducto', 'NombreProducto', 'Cantidad', 'ValorUnitario', 'ValorTotal', 
                    'CentroCostos', 'SubCentroCostos', 'Bodega', 'Lote', 'Vencimiento',
                    'Referencia', 'Detalle', 'IVA', 'Retencion', 'Descuento', 'Caja', 'Banco',
                    'CuentaContable', 'Concepto', 'Vendedor', 'Ciudad', 'Direccion', 'Telefono',
                    'Email', 'FormaPago', 'Plazo', 'Cuotas', 'Observaciones', 'CampoExtra1',
                    'CampoExtra2', 'CampoExtra3', 'CampoExtra4', 'CampoExtra5', 'CampoExtra6',
                    'CampoExtra7', 'CampoExtra8', 'CampoExtra9', 'CampoExtra10', 'Usuario',
                    'Terminal', 'Hora', 'FechaVencimiento', 'ImpuestoConsumo', 'UnidadMedida'
                ];

                if (exportType === 'cuts') {
                    row['TipoDocumento'] = 'FV'; 
                    row['Prefijo'] = 'FF';
                    row['Numero'] = item.orders?.sequence_id || index + 1;
                    row['Fecha'] = dateRange.start;
                    row['NitTercero'] = item.orders?.profiles?.nit || '222222222';
                    row['NombreTercero'] = item.orders?.profiles?.company_name || 'CLIENTE MOSTRADOR';
                    row['CodigoProducto'] = item.products?.sku || 'GENERIC';
                    row['NombreProducto'] = item.nickname || item.products?.name || 'PRODUCTO';
                    row['Cantidad'] = item.quantity;
                    row['ValorUnitario'] = item.unit_price;
                    row['ValorTotal'] = item.quantity * item.unit_price;
                    row['CentroCostos'] = 'VENTAS';
                    row['UnidadMedida'] = 'UND';
                } else {
                    row['TipoDocumento'] = 'CP'; 
                    row['Prefijo'] = 'CONT';
                    row['Numero'] = item.external_doc_number || index + 1;
                    row['Fecha'] = item.created_at?.split('T')[0] || dateRange.start;
                    row['NitTercero'] = item.provider?.nit || '111111111';
                    row['NombreTercero'] = item.provider?.name || 'PROVEEDOR VARIOS';
                    row['CodigoProducto'] = item.product?.sku || 'RAW';
                    row['NombreProducto'] = item.product?.name || 'COMPRA';
                    row['Cantidad'] = item.quantity;
                    row['ValorUnitario'] = item.unit_price || (item.total_cost / item.quantity);
                    row['ValorTotal'] = item.total_cost || (item.quantity * item.unit_price);
                    row['CentroCostos'] = 'COMPRAS';
                }

                columns.forEach(col => {
                    if (row[col] === undefined) row[col] = '';
                });

                return row;
            });

            addLog('Generando archivo Excel (.xlsx)...', 'success');
            const ws = XLSX.utils.json_to_sheet(woData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "WorldOffice");

            const fileName = `Export_WO_${exportType}_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);
            
            addLog(`¡Exportación exitosa! Archivo: ${fileName}`, 'success');
        } catch (err: any) {
            addLog(`Error en exportación: ${err.message}`, 'error');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (!mounted) return null;

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '3rem 2rem' }}>
                
                {/* Header */}
                <div style={{ marginBottom: '2.5rem' }}>
                    <Link href="/admin/procurement" style={{ 
                        textDecoration: 'none', 
                        color: THEME.colors.textSecondary, 
                        fontWeight: '600', 
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        marginBottom: '0.75rem'
                    }}>
                        <ArrowLeft size={14} strokeWidth={1.5} /> Volver a Compras 360
                    </Link>
                    <h1 style={{ fontSize: '2.4rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.03em' }}>
                        Exportador <span style={{ color: THEME.colors.primary }}>WorldOffice</span>
                    </h1>
                    <p style={{ color: THEME.colors.textSecondary, fontSize: '1rem', marginTop: '0.5rem', fontWeight: '400' }}>
                        Utilidad avanzada de integración contable con formato de 50 columnas.
                    </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2.5rem' }}>
                    
                    {/* Configuration Card */}
                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, padding: '2rem', boxShadow: THEME.shadow.sm }}>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: THEME.colors.textMain, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
                            <Layers size={20} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /> Configuración de Carga
                        </h2>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, marginBottom: '0.6rem', textTransform: 'uppercase' }}>Tipo de Información</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                                    {[
                                        { id: 'cuts', label: 'Cortes Fact.', icon: <Database size={16} strokeWidth={1.5} /> },
                                        { id: 'cash', label: 'Compras Cont.', icon: <FileSpreadsheet size={16} strokeWidth={1.5} /> },
                                        { id: 'expenses', label: 'Gastos Fijos', icon: <Clock size={16} strokeWidth={1.5} /> },
                                        { id: 'providers', label: 'Proveedores', icon: <Users size={16} strokeWidth={1.5} /> }
                                    ].map(type => (
                                        <button 
                                            key={type.id}
                                            onClick={() => setExportType(type.id as any)}
                                            style={{
                                                padding: '0.75rem 0.5rem',
                                                borderRadius: THEME.radius.sm,
                                                border: '1px solid',
                                                borderColor: exportType === type.id ? THEME.colors.primary : THEME.colors.border,
                                                backgroundColor: exportType === type.id ? THEME.colors.primaryLight : 'white',
                                                color: exportType === type.id ? THEME.colors.primary : THEME.colors.textSecondary,
                                                fontWeight: '600',
                                                fontSize: '0.85rem',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '0.4rem',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {type.icon}
                                            {type.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, marginBottom: '0.5rem', textTransform: 'uppercase' }}>Fecha Inicial</label>
                                    <input 
                                        type="date" 
                                        value={dateRange.start}
                                        onChange={e => setDateRange(prev => ({...prev, start: e.target.value}))}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, color: THEME.colors.textMain, fontWeight: '500', outline: 'none', backgroundColor: 'white' }} 
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, marginBottom: '0.5rem', textTransform: 'uppercase' }}>Fecha Final</label>
                                    <input 
                                        type="date" 
                                        value={dateRange.end}
                                        onChange={e => setDateRange(prev => ({...prev, end: e.target.value}))}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, color: THEME.colors.textMain, fontWeight: '500', outline: 'none', backgroundColor: 'white' }} 
                                    />
                                </div>
                            </div>

                            <button 
                                onClick={handleExport}
                                disabled={loading}
                                style={{
                                    marginTop: '0.5rem',
                                    padding: '0.85rem',
                                    borderRadius: THEME.radius.sm,
                                    border: 'none',
                                    backgroundColor: loading ? THEME.colors.textSecondary : THEME.colors.primary,
                                    color: 'white',
                                    fontWeight: '600',
                                    fontSize: '0.95rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                    transition: 'background-color 0.2s'
                                }}
                                onMouseOver={e => { if (!loading) e.currentTarget.style.backgroundColor = THEME.colors.primaryHover; }}
                                onMouseOut={e => { if (!loading) e.currentTarget.style.backgroundColor = THEME.colors.primary; }}
                            >
                                {loading ? <Clock className="animate-spin" size={18} /> : <Download size={18} strokeWidth={1.5} />}
                                {loading ? 'PROCESANDO...' : 'GENERAR ARCHIVO PLANO'}
                            </button>
                        </div>
                    </div>

                    {/* Log Console */}
                    <div style={{ backgroundColor: '#0F172A', borderRadius: THEME.radius.md, padding: '1.5rem', color: '#E2E8F0', display: 'flex', flexDirection: 'column', border: '1px solid #1E293B', boxShadow: THEME.shadow.sm }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h3 style={{ fontSize: '0.8rem', fontWeight: '600', color: '#38BDF8', display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                                <Cpu size={16} strokeWidth={1.5} /> Terminal de Exportación
                            </h3>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: loading ? '#F59E0B' : '#10B981' }}></div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', minHeight: '200px', paddingRight: '0.5rem' }} className="custom-scrollbar">
                            {logs.length === 0 ? (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '0.85rem', fontWeight: '500', fontStyle: 'italic' }}>
                                    Esperando ejecución...
                                </div>
                            ) : (
                                logs.map((log, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '0.6rem', fontSize: '0.8rem', lineHeight: '1.4' }}>
                                        <span style={{ color: '#475569', fontWeight: '600', userSelect: 'none' }}>[{i+1}]</span>
                                        <span style={{ 
                                            color: log.type === 'success' ? '#4ADE80' : log.type === 'error' ? '#F87171' : '#E2E8F0',
                                            fontWeight: log.type !== 'info' ? '600' : '400'
                                        }}>
                                            {log.msg}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>

                        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #1E293B', fontSize: '0.7rem', color: '#475569', fontWeight: '600' }}>
                            READY FOR WORLD OFFICE V12.0.4
                        </div>
                    </div>

                </div>

                {/* Footer Info */}
                <div style={{ marginTop: '2.5rem', backgroundColor: THEME.colors.primaryLight, borderRadius: THEME.radius.sm, padding: '1rem 1.5rem', border: `1px dashed ${THEME.colors.primary}`, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <AlertCircle size={20} strokeWidth={1.5} style={{ color: THEME.colors.primary, flexShrink: 0 }} />
                    <p style={{ color: THEME.colors.primary, fontSize: '0.85rem', fontWeight: '500', margin: 0 }}>
                        Este exportador cumple con la estructura de mapeo dinámico para WorldOffice. Asegúrese de que los NITs de los terceros coincidan con su base de datos contable.
                    </p>
                </div>

            </div>

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #1E293B;
                    border-radius: 10px;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
            `}</style>
        </main>
    );
}

