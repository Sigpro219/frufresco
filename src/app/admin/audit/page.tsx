'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, ShieldAlert, Search, Calendar, User, Settings } from 'lucide-react';
import { THEME } from '@/lib/adminTheme';

export default function AuditLogPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState('all');
    const [actionType, setActionType] = useState('all');

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background }}>
            
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
                {/* Header Técnico */}
                <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '0.5rem' }}>
                            <Link href="/admin/dashboard" style={{ color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center' }}>
                                <ArrowLeft size={20} strokeWidth={1.5} />
                            </Link>
                            <h1 style={{ fontSize: '2rem', fontFamily: THEME.typography.fontFamilyMain, fontWeight: '800', color: THEME.colors.textMain, letterSpacing: '-0.025em', margin: 0 }}>
                                Trazabilidad de <span style={{ color: THEME.colors.primary }}>Movimientos</span>
                            </h1>
                        </div>
                        <p style={{ color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary, fontSize: '0.95rem', fontWeight: '500' }}>Registro inalterable de movimientos y gobernanza del sistema.</p>
                    </div>
                    
                    <button 
                        disabled
                        style={{ 
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '0.65rem 1.25rem', 
                            backgroundColor: THEME.colors.surface, border: `1px solid ${THEME.colors.border}`, borderRadius: THEME.radius.md,
                            color: THEME.colors.textSecondary, fontWeight: '700', fontSize: '0.85rem', cursor: 'not-allowed', opacity: 0.6
                        }}
                    >
                        <Download size={18} strokeWidth={1.5} /> Descargar Reporte (XLSX)
                    </button>
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
                            placeholder="Buscar por usuario, acción o referencia..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ 
                                width: '100%', padding: '0.65rem 1rem 0.65rem 2.8rem', borderRadius: THEME.radius.md, 
                                border: `1px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background, fontWeight: '600', fontSize: '0.9rem',
                                fontFamily: THEME.typography.fontFamilySecondary, color: THEME.colors.textMain
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
                            value={actionType}
                            onChange={(e) => setActionType(e.target.value)}
                            style={{ border: 'none', background: 'none', fontWeight: '700', color: THEME.colors.textMain, fontSize: '0.85rem', cursor: 'pointer', outline: 'none', fontFamily: THEME.typography.fontFamilySecondary }}
                        >
                            <option value="all">Todas las Acciones</option>
                            <option value="create">Creación</option>
                            <option value="update">Modificación</option>
                            <option value="delete">Eliminación</option>
                            <option value="security">Seguridad/Login</option>
                        </select>
                    </div>
                </div>

                {/* Tabla de Auditoría (Estado Pendiente) */}
                <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}`, overflow: 'hidden', minHeight: '400px', display: 'flex', flexDirection: 'column', boxShadow: THEME.shadow.sm }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ backgroundColor: '#F9FAFB', borderBottom: `1px solid ${THEME.colors.border}` }}>
                            <tr>
                                <th style={{ padding: '0.65rem 1.25rem', fontSize: THEME.typography.tableHeader.fontSize, letterSpacing: THEME.typography.tableHeader.letterSpacing, fontWeight: THEME.typography.tableHeader.fontWeight, color: THEME.typography.tableHeader.color, textTransform: THEME.typography.tableHeader.textTransform }}>Fecha y Hora</th>
                                <th style={{ padding: '0.65rem 1.25rem', fontSize: THEME.typography.tableHeader.fontSize, letterSpacing: THEME.typography.tableHeader.letterSpacing, fontWeight: THEME.typography.tableHeader.fontWeight, color: THEME.typography.tableHeader.color, textTransform: THEME.typography.tableHeader.textTransform }}>Usuario</th>
                                <th style={{ padding: '0.65rem 1.25rem', fontSize: THEME.typography.tableHeader.fontSize, letterSpacing: THEME.typography.tableHeader.letterSpacing, fontWeight: THEME.typography.tableHeader.fontWeight, color: THEME.typography.tableHeader.color, textTransform: THEME.typography.tableHeader.textTransform }}>Acción</th>
                                <th style={{ padding: '0.65rem 1.25rem', fontSize: THEME.typography.tableHeader.fontSize, letterSpacing: THEME.typography.tableHeader.letterSpacing, fontWeight: THEME.typography.tableHeader.fontWeight, color: THEME.typography.tableHeader.color, textTransform: THEME.typography.tableHeader.textTransform }}>Módulo</th>
                                <th style={{ padding: '0.65rem 1.25rem', fontSize: THEME.typography.tableHeader.fontSize, letterSpacing: THEME.typography.tableHeader.letterSpacing, fontWeight: THEME.typography.tableHeader.fontWeight, color: THEME.typography.tableHeader.color, textTransform: THEME.typography.tableHeader.textTransform }}>Detalles</th>
                            </tr>
                        </thead>
                    </table>
                    
                    {/* Empty State / Pending Connection */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem', textAlign: 'center' }}>
                        <div style={{ 
                            width: '80px', height: '80px', borderRadius: '50%', backgroundColor: THEME.colors.primaryLight, 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem',
                            color: THEME.colors.primary
                        }}>
                            <ShieldAlert size={40} strokeWidth={1.5} />
                        </div>
                        <h2 style={{ fontSize: '1.4rem', fontFamily: THEME.typography.fontFamilyMain, fontWeight: '800', color: THEME.colors.textMain, marginBottom: '0.5rem' }}>Módulo en Fase de Pre-despliegue</h2>
                        <p style={{ color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary, fontSize: '0.9rem', maxWidth: '450px', lineHeight: '1.6', fontWeight: '500' }}>
                            La arquitectura visual está lista. El sistema no muestra registros porque el **Motor de Auditoría en Tiempo Real (DB Triggers)** está pendiente de activación técnica.
                        </p>
                        <div style={{ 
                            marginTop: '2rem', padding: '0.8rem 1.5rem', backgroundColor: THEME.colors.background, 
                            borderRadius: THEME.radius.md, fontSize: '0.8rem', fontWeight: '700', color: THEME.colors.textMain,
                            border: `1px dashed ${THEME.colors.borderActive}`, display: 'flex', alignItems: 'center', gap: '8px'
                        }}>
                            <Settings size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /> TAREA PENDIENTE: Vincular Triggers de Postgres a Tabla audit_logs
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
