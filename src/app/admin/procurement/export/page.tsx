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
                // Base structure (Standard WorldOffice Flat File)
                const row: any = {};
                
                // We create 50 columns (mapped or empty)
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
                    row['TipoDocumento'] = 'FV'; // Factura Venta
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
                    row['TipoDocumento'] = 'CP'; // Comprobante Pago / Compra
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

                // Fill rest of columns with empty strings
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
        <main style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: 'Outfit, sans-serif' }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '3rem 2rem' }}>
                
                {/* Header */}
                <div style={{ marginBottom: '3rem' }}>
                    <Link href="/admin/procurement" style={{ 
                        textDecoration: 'none', 
                        color: '#64748B', 
                        fontWeight: '700', 
                        fontSize: '0.9rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        marginBottom: '1rem'
                    }}>
                        <ArrowLeft size={16} /> Volver a Compras 360
                    </Link>
                    <h1 style={{ fontSize: '2.8rem', fontWeight: '900', color: '#0F172A', margin: 0, letterSpacing: '-0.03em' }}>
                        Exportador <span style={{ color: '#0EA5E9' }}>WorldOffice</span>
                    </h1>
                    <p style={{ color: '#64748B', fontSize: '1.1rem', marginTop: '0.5rem', fontWeight: '500' }}>
                        Utilidad avanzada de integración contable con formato de 50 columnas.
                    </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2.5rem' }}>
                    
                    {/* Configuration Card */}
                    <div style={{ backgroundColor: 'white', borderRadius: '32px', border: '1px solid #E2E8F0', padding: '2.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                        <h2 style={{ fontSize: '1.4rem', fontWeight: '900', color: '#0F172A', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                            <Layers size={24} color="#0EA5E9" /> Configuración de Carga
                        </h2>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.8rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '800', color: '#64748B', marginBottom: '0.8rem', textTransform: 'uppercase' }}>Tipo de Información</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.8rem' }}>
                                    {[
                                        { id: 'cuts', label: 'Cortes Fact.', icon: <Database size={18} /> },
                                        { id: 'cash', label: 'Compras Cont.', icon: <FileSpreadsheet size={18} /> },
                                        { id: 'expenses', label: 'Gastos Fijos', icon: <Clock size={18} /> },
                                        { id: 'providers', label: 'Proveedores', icon: <Users size={18} /> }
                                    ].map(type => (
                                        <button 
                                            key={type.id}
                                            onClick={() => setExportType(type.id as any)}
                                            style={{
                                                padding: '1rem 0.5rem',
                                                borderRadius: '16px',
                                                border: '2px solid',
                                                borderColor: exportType === type.id ? '#0EA5E9' : '#F1F5F9',
                                                backgroundColor: exportType === type.id ? '#F0F9FF' : 'white',
                                                color: exportType === type.id ? '#0EA5E9' : '#64748B',
                                                fontWeight: '800',
                                                fontSize: '0.8rem',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                gap: '0.5rem',
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
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '800', color: '#64748B', marginBottom: '0.8rem', textTransform: 'uppercase' }}>Fecha Inicial</label>
                                    <input 
                                        type="date" 
                                        value={dateRange.start}
                                        onChange={e => setDateRange(prev => ({...prev, start: e.target.value}))}
                                        style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #E2E8F0', fontWeight: '700', outline: 'none' }} 
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '800', color: '#64748B', marginBottom: '0.8rem', textTransform: 'uppercase' }}>Fecha Final</label>
                                    <input 
                                        type="date" 
                                        value={dateRange.end}
                                        onChange={e => setDateRange(prev => ({...prev, end: e.target.value}))}
                                        style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #E2E8F0', fontWeight: '700', outline: 'none' }} 
                                    />
                                </div>
                            </div>

                            <button 
                                onClick={handleExport}
                                disabled={loading}
                                style={{
                                    marginTop: '1rem',
                                    padding: '1.2rem',
                                    borderRadius: '18px',
                                    border: 'none',
                                    backgroundColor: loading ? '#94A3B8' : '#0F172A',
                                    color: 'white',
                                    fontWeight: '900',
                                    fontSize: '1rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.8rem',
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                    boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.2)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {loading ? <Clock className="animate-spin" /> : <Download size={22} />}
                                {loading ? 'PROCESANDO...' : 'GENERAR ARCHIVO PLANO'}
                            </button>
                        </div>
                    </div>

                    {/* Log Console */}
                    <div style={{ backgroundColor: '#0F172A', borderRadius: '32px', padding: '2rem', color: '#E2E8F0', display: 'flex', flexDirection: 'column', border: '1px solid #1E293B', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: '900', color: '#38BDF8', display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                <Cpu size={18} /> Terminal de Exportación
                            </h3>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: loading ? '#F59E0B' : '#10B981' }}></div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.8rem', maxHeight: '350px', paddingRight: '0.5rem' }} className="custom-scrollbar">
                            {logs.length === 0 ? (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '0.9rem', fontWeight: '600', fontStyle: 'italic' }}>
                                    Esperando ejecución...
                                </div>
                            ) : (
                                logs.map((log, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '0.8rem', fontSize: '0.85rem', lineHeight: '1.4' }}>
                                        <span style={{ color: '#475569', fontWeight: '700', userSelect: 'none' }}>[{i+1}]</span>
                                        <span style={{ 
                                            color: log.type === 'success' ? '#4ADE80' : log.type === 'error' ? '#F87171' : '#E2E8F0',
                                            fontWeight: log.type !== 'info' ? '700' : '500'
                                        }}>
                                            {log.msg}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>

                        <div style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid #1E293B', fontSize: '0.75rem', color: '#475569', fontWeight: '700' }}>
                            READY FOR WORLD OFFICE V12.0.4
                        </div>
                    </div>

                </div>

                {/* Footer Info */}
                <div style={{ marginTop: '3rem', backgroundColor: 'rgba(14, 165, 233, 0.05)', borderRadius: '24px', padding: '1.5rem 2rem', border: '1px dashed #BAE6FD', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <AlertCircle size={24} color="#0EA5E9" />
                    <p style={{ color: '#0369A1', fontSize: '0.9rem', fontWeight: '600', margin: 0 }}>
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
