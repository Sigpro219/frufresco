'use client';

import React, { useState } from 'react';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { ArrowLeft, Download, ShieldAlert, Search, Calendar, User } from 'lucide-react';

export default function AuditLogPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState('all');
    const [actionType, setActionType] = useState('all');

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F9FAFB' }}>
            <Navbar />
            
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
                {/* Header Técnico */}
                <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '0.5rem' }}>
                            <Link href="/admin/dashboard" style={{ color: '#6B7280', display: 'flex', alignItems: 'center' }}>
                                <ArrowLeft size={20} />
                            </Link>
                            <h1 style={{ fontSize: '2.2rem', fontWeight: '900', color: '#111827', letterSpacing: '-0.025em', margin: 0 }}>
                                Trazabilidad de <span style={{ color: '#6366F1' }}>Movimientos</span>
                            </h1>
                        </div>
                        <p style={{ color: '#6B7280', fontSize: '1rem', fontWeight: '500' }}>Registro inalterable de movimientos y gobernanza del sistema.</p>
                    </div>
                    
                    <button 
                        disabled
                        style={{ 
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '0.8rem 1.5rem', 
                            backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '14px',
                            color: '#9CA3AF', fontWeight: '800', fontSize: '0.9rem', cursor: 'not-allowed'
                        }}
                    >
                        <Download size={18} /> Descargar Reporte (XLSX)
                    </button>
                </header>

                {/* Filtros de Auditoría */}
                <div style={{ 
                    backgroundColor: 'white', padding: '1.2rem', borderRadius: '20px', border: '1px solid #E5E7EB', 
                    display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap', alignItems: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                    <div style={{ flex: 1, minWidth: '300px', position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
                        <input 
                            placeholder="Buscar por usuario, acción o referencia..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ 
                                width: '100%', padding: '0.7rem 1rem 0.7rem 2.8rem', borderRadius: '12px', 
                                border: '1px solid #F3F4F6', backgroundColor: '#F9FAFB', fontWeight: '600', fontSize: '0.9rem'
                            }}
                        />
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#F9FAFB', padding: '0.4rem 0.8rem', borderRadius: '12px', border: '1px solid #F3F4F6' }}>
                        <Calendar size={16} color="#6366F1" />
                        <select 
                            value={dateRange}
                            onChange={(e) => setDateRange(e.target.value)}
                            style={{ border: 'none', background: 'none', fontWeight: '700', color: '#4B5563', fontSize: '0.85rem', cursor: 'pointer', outline: 'none' }}
                        >
                            <option value="all">Cualquier Fecha</option>
                            <option value="today">Hoy</option>
                            <option value="week">Esta Semana</option>
                            <option value="month">Este Mes</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#F9FAFB', padding: '0.4rem 0.8rem', borderRadius: '12px', border: '1px solid #F3F4F6' }}>
                        <User size={16} color="#6366F1" />
                        <select 
                            value={actionType}
                            onChange={(e) => setActionType(e.target.value)}
                            style={{ border: 'none', background: 'none', fontWeight: '700', color: '#4B5563', fontSize: '0.85rem', cursor: 'pointer', outline: 'none' }}
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
                <div style={{ backgroundColor: 'white', borderRadius: '24px', border: '1px solid #E5E7EB', overflow: 'hidden', minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                            <tr>
                                <th style={{ padding: '1.2rem', fontSize: '0.75rem', fontWeight: '800', color: '#6B7280', textTransform: 'uppercase' }}>Fecha y Hora</th>
                                <th style={{ padding: '1.2rem', fontSize: '0.75rem', fontWeight: '800', color: '#6B7280', textTransform: 'uppercase' }}>Usuario</th>
                                <th style={{ padding: '1.2rem', fontSize: '0.75rem', fontWeight: '800', color: '#6B7280', textTransform: 'uppercase' }}>Acción</th>
                                <th style={{ padding: '1.2rem', fontSize: '0.75rem', fontWeight: '800', color: '#6B7280', textTransform: 'uppercase' }}>Módulo</th>
                                <th style={{ padding: '1.2rem', fontSize: '0.75rem', fontWeight: '800', color: '#6B7280', textTransform: 'uppercase' }}>Detalles</th>
                            </tr>
                        </thead>
                    </table>
                    
                    {/* Empty State / Pending Connection */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem', textAlign: 'center' }}>
                        <div style={{ 
                            width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#EEF2FF', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem',
                            color: '#6366F1'
                        }}>
                            <ShieldAlert size={40} />
                        </div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: '900', color: '#111827', marginBottom: '0.5rem' }}>Módulo en Fase de Pre-despliegue</h2>
                        <p style={{ color: '#6B7280', maxWidth: '450px', lineHeight: '1.6', fontWeight: '500' }}>
                            La arquitectura visual está lista. El sistema no muestra registros porque el **Motor de Auditoría en Tiempo Real (DB Triggers)** está pendiente de activación técnica.
                        </p>
                        <div style={{ 
                            marginTop: '2rem', padding: '0.8rem 1.5rem', backgroundColor: '#F3F4F6', 
                            borderRadius: '12px', fontSize: '0.8rem', fontWeight: '700', color: '#4B5563',
                            border: '1px dashed #D1D5DB'
                        }}>
                            ⚙️ TAREA PENDIENTE: Vincular Triggers de Postgres a Tabla audit_logs
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
