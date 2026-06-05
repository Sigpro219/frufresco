'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, ShieldAlert, Search, Calendar, User, RefreshCw, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { THEME } from '@/lib/adminTheme';
import * as XLSX from 'xlsx';

interface AuditLog {
    id: string;
    created_at: string;
    collaborator_id: string | null;
    collaborator_name: string | null;
    action: string;
    module: string;
    details: any;
}

export default function AuditLogPage() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    );

    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState('all');
    const [actionFilter, setActionFilter] = useState('all');
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('audit_logs')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setLogs(data || []);
        } catch (err) {
            console.error('Error fetching audit logs:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleExportExcel = () => {
        if (logs.length === 0) return alert('No hay datos para exportar');
        const formatted = logs.map(l => ({
            'Fecha y Hora': new Date(l.created_at).toLocaleString(),
            'Usuario/Colaborador': l.collaborator_name || 'Sistema / Auto-clean',
            'Acción': l.action,
            'Módulo': l.module,
            'Detalles JSON': JSON.stringify(l.details)
        }));

        const ws = XLSX.utils.json_to_sheet(formatted);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Historial Auditoria');
        XLSX.writeFile(wb, `Frufresco_Trazabilidad_${Date.now()}.xlsx`);
    };

    const toggleExpand = (id: string) => {
        setExpandedLogId(expandedLogId === id ? null : id);
    };

    const filteredLogs = logs.filter(log => {
        // Search Filter
        const query = searchTerm.toLowerCase();
        const matchesSearch = !query || 
            (log.collaborator_name || '').toLowerCase().includes(query) ||
            log.action.toLowerCase().includes(query) ||
            log.module.toLowerCase().includes(query) ||
            JSON.stringify(log.details).toLowerCase().includes(query);

        // Date Filter
        let matchesDate = true;
        if (dateRange !== 'all') {
            const date = new Date(log.created_at);
            const today = new Date();
            if (dateRange === 'today') {
                matchesDate = date.toDateString() === today.toDateString();
            } else if (dateRange === 'week') {
                const diffTime = Math.abs(today.getTime() - date.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                matchesDate = diffDays <= 7;
            } else if (dateRange === 'month') {
                matchesDate = date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
            }
        }

        // Action Filter
        let matchesAction = true;
        if (actionFilter !== 'all') {
            matchesAction = log.action.toLowerCase().includes(actionFilter.toLowerCase());
        }

        return matchesSearch && matchesDate && matchesAction;
    });

    const getActionBadgeStyle = (action: string) => {
        const act = action.toUpperCase();
        if (act.includes('START') || act.includes('INICIAR') || act.includes('APPROVE') || act.includes('AUTORIZAR')) {
            return { color: '#059669', bg: '#D1FAE5' };
        }
        if (act.includes('REJECT') || act.includes('RECHAZAR') || act.includes('REGENERATE')) {
            return { color: '#DC2626', bg: '#FEE2E2' };
        }
        return { color: '#4B5563', bg: '#F3F4F6' };
    };

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background }}>
            
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
                {/* Header Técnico */}
                <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '0.5rem' }}>
                            <Link href="/admin/dashboard" style={{ color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center' }}>
                                <ArrowLeft size={20} strokeWidth={1.5} />
                            </Link>
                            <h1 style={{ fontSize: '2rem', fontFamily: THEME.typography.fontFamilyMain, fontWeight: '800', color: THEME.colors.textMain, letterSpacing: '-0.025em', margin: 0 }}>
                                Trazabilidad de <span style={{ color: THEME.colors.primary }}>Movimientos</span>
                            </h1>
                        </div>
                        <p style={{ color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary, fontSize: '0.95rem', fontWeight: '500' }}>
                            Registro inalterable de hechos de colaboradores con política de limpieza de 60 días.
                        </p>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button 
                            onClick={fetchLogs}
                            style={{ 
                                display: 'flex', alignItems: 'center', gap: '6px', padding: '0.65rem 1rem', 
                                backgroundColor: THEME.colors.surface, border: `1px solid ${THEME.colors.border}`, borderRadius: THEME.radius.md,
                                color: THEME.colors.textSecondary, fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer'
                            }}
                        >
                            <RefreshCw size={16} strokeWidth={1.5} />
                        </button>
                        <button 
                            onClick={handleExportExcel}
                            disabled={filteredLogs.length === 0}
                            style={{ 
                                display: 'flex', alignItems: 'center', gap: '8px', padding: '0.65rem 1.25rem', 
                                backgroundColor: THEME.colors.primary, border: 'none', borderRadius: THEME.radius.md,
                                color: 'white', fontWeight: '700', fontSize: '0.85rem', cursor: filteredLogs.length === 0 ? 'not-allowed' : 'pointer',
                                opacity: filteredLogs.length === 0 ? 0.6 : 1
                            }}
                        >
                            <Download size={18} strokeWidth={1.5} /> Descargar Reporte (XLSX)
                        </button>
                    </div>
                </header>

                {/* Filtros de Auditoría */}
                <div style={{ 
                    backgroundColor: THEME.colors.surface, padding: '1.2rem', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, 
                    display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap', alignItems: 'center',
                    boxShadow: THEME.shadow.sm
                }}>
                    <div style={{ flex: 1, minWidth: '300px', position: 'relative' }}>
                        <Search size={18} strokeWidth={1.5} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary }} />
                        <input 
                            placeholder="Buscar por usuario, acción o contenido en detalles..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ 
                                width: '100%', padding: '0.65rem 1rem 0.65rem 2.8rem', borderRadius: THEME.radius.md, 
                                border: `1px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background, fontWeight: '600', fontSize: '0.9rem',
                                fontFamily: THEME.typography.fontFamilySecondary, color: THEME.colors.textMain, outline: 'none'
                            }}
                        />
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: THEME.colors.background, padding: '0.4rem 0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                        <Calendar size={16} strokeWidth={1.5} color={THEME.colors.primary} />
                        <select 
                            value={dateRange}
                            onChange={(e) => setDateRange(e.target.value)}
                            style={{ border: 'none', background: 'none', fontWeight: '700', color: THEME.colors.textMain, fontSize: '0.85rem', cursor: 'pointer', outline: 'none', fontFamily: THEME.typography.fontFamilySecondary }}
                        >
                            <option value="all">Cualquier Fecha</option>
                            <option value="today">Hoy</option>
                            <option value="week">Esta Semana</option>
                            <option value="month">Este Mes</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: THEME.colors.background, padding: '0.4rem 0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                        <User size={16} strokeWidth={1.5} color={THEME.colors.primary} />
                        <select 
                            value={actionFilter}
                            onChange={(e) => setActionFilter(e.target.value)}
                            style={{ border: 'none', background: 'none', fontWeight: '700', color: THEME.colors.textMain, fontSize: '0.85rem', cursor: 'pointer', outline: 'none', fontFamily: THEME.typography.fontFamilySecondary }}
                        >
                            <option value="all">Todas las Acciones</option>
                            <option value="TURN">Turno (Ingreso/Salida)</option>
                            <option value="PERMISSIONS">Permisos / Roles</option>
                            <option value="QR">Credencial (Generación/Perdida)</option>
                            <option value="DELIVERY">Despachos / Ruta</option>
                            <option value="QUARANTINE">Cuarentena de Calidad</option>
                            <option value="DISCREPANCY">Excedentes báscula</option>
                        </select>
                    </div>
                </div>

                {/* Tabla de Auditoría */}
                <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}`, overflow: 'hidden', minHeight: '400px', display: 'flex', flexDirection: 'column', boxShadow: THEME.shadow.sm }}>
                    {loading ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem' }}>
                            <RefreshCw className="animate-spin" size={32} style={{ color: THEME.colors.primary }} />
                        </div>
                    ) : filteredLogs.length === 0 ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem', textAlign: 'center' }}>
                            <ShieldAlert size={48} strokeWidth={1.5} style={{ color: THEME.colors.textSecondary, marginBottom: '1rem' }} />
                            <h2 style={{ fontSize: '1.2rem', fontWeight: '800', color: THEME.colors.textMain }}>Sin registros de auditoría</h2>
                            <p style={{ color: THEME.colors.textSecondary, fontSize: '0.9rem', maxWidth: '380px', marginTop: '0.25rem' }}>
                                No se encontraron hechos registrados que coincidan con los filtros seleccionados.
                            </p>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead style={{ backgroundColor: THEME.colors.background, borderBottom: `1.5px solid ${THEME.colors.border}` }}>
                                    <tr>
                                        <th style={{ padding: '0.85rem 1.25rem', fontSize: '0.7rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>Fecha y Hora</th>
                                        <th style={{ padding: '0.85rem 1.25rem', fontSize: '0.7rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>Colaborador</th>
                                        <th style={{ padding: '0.85rem 1.25rem', fontSize: '0.7rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>Acción</th>
                                        <th style={{ padding: '0.85rem 1.25rem', fontSize: '0.7rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>Módulo</th>
                                        <th style={{ padding: '0.85rem 1.25rem', fontSize: '0.7rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', textAlign: 'right' }}>Detalle</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredLogs.map(log => {
                                        const badge = getActionBadgeStyle(log.action);
                                        const isExpanded = expandedLogId === log.id;
                                        return (
                                            <React.Fragment key={log.id}>
                                                <tr className="audit-tr" style={{ borderBottom: `1px solid ${THEME.colors.border}`, cursor: 'pointer' }} onClick={() => toggleExpand(log.id)}>
                                                    <td style={{ padding: '0.85rem 1.25rem', fontSize: '0.85rem', fontWeight: '600', color: THEME.colors.textMain }}>
                                                        {new Date(log.created_at).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '0.85rem 1.25rem', fontSize: '0.85rem', fontWeight: '700', color: THEME.colors.textMain }}>
                                                        {log.collaborator_name || 'Sistema'}
                                                    </td>
                                                    <td style={{ padding: '0.85rem 1.25rem' }}>
                                                        <span style={{ fontSize: '0.65rem', fontWeight: '900', color: badge.color, backgroundColor: badge.bg, padding: '3px 8px', borderRadius: '6px', textTransform: 'uppercase' }}>
                                                            {log.action}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.85rem 1.25rem', fontSize: '0.85rem', fontWeight: '800', color: THEME.colors.primary }}>
                                                        {log.module}
                                                    </td>
                                                    <td style={{ padding: '0.85rem 1.25rem', textAlign: 'right', color: THEME.colors.textSecondary }}>
                                                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr style={{ backgroundColor: '#F8FAF9' }}>
                                                        <td colSpan={5} style={{ padding: '1.25rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                            <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: THEME.colors.textSecondary, marginBottom: '6px' }}>METADATOS DEL EVENTO:</div>
                                                            <pre style={{ margin: 0, padding: '1rem', backgroundColor: '#FFFFFF', borderRadius: '8px', border: `1px solid ${THEME.colors.border}`, overflowX: 'auto', fontFamily: 'monospace', fontSize: '0.8rem', color: THEME.colors.textMain }}>
                                                                {JSON.stringify(log.details, null, 2)}
                                                            </pre>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
            
            <style jsx>{`
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .audit-tr {
                    transition: background-color 0.15s ease;
                }
                .audit-tr:hover {
                    background-color: #F8FAF9;
                }
            `}</style>
        </main>
    );
}
