'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Printer, ArrowLeft, ClipboardList, Calendar, Filter } from 'lucide-react';
import GoldenPrintStyles from '@/components/print/GoldenPrintStyles';
import UniversalLetterhead from '@/components/print/UniversalLetterhead';
import { INVESTMENTS_CORTES_BRAND } from '@/components/print/presets';
import { printViaNewWindow } from '@/components/print';

interface ProductItem {
    id: string;
    name: string;
    sku?: string;
    unit_of_measure?: string;
    inventory_group?: string;
    category?: string;
}

export default function PhysicalCountPrintPage() {
    const router = useRouter();
    const printDocRef = useRef<HTMLDivElement>(null);

    const [selectedDate, setSelectedDate] = useState<string>(() => {
        const now = new Date();
        return now.toISOString().split('T')[0];
    });

    const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
    const [products, setProducts] = useState<ProductItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchProducts();
    }, []);

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('products')
                .select('id, name, sku, unit_of_measure, inventory_group, category')
                .eq('is_active', true)
                .order('name', { ascending: true });

            if (error) throw error;
            setProducts(data || []);
        } catch (err) {
            console.error('Error cargando catálogo de inventario:', err);
        } finally {
            setLoading(false);
        }
    };

    // Group products by inventory_group
    const grouped = useMemo(() => {
        const map: Record<string, ProductItem[]> = {};
        products.forEach(p => {
            const g = (p.inventory_group || 'INVENTARIO GENERAL / OTROS').toUpperCase().trim();
            if (!map[g]) map[g] = [];
            map[g].push(p);
        });
        return map;
    }, [products]);

    const availableGroups = useMemo(() => Object.keys(grouped).sort(), [grouped]);

    const filteredGroups = useMemo(() => {
        if (selectedGroup === 'ALL') return availableGroups;
        return availableGroups.filter(g => g === selectedGroup);
    }, [availableGroups, selectedGroup]);

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F1F5F9', paddingBottom: '3rem' }}>
            <GoldenPrintStyles />

            <style jsx global>{`
                @media print {
                    @page {
                        size: letter portrait !important;
                        margin: 0.8cm !important;
                    }
                    body {
                        background-color: #FFFFFF !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                    .page-break {
                        page-break-after: always !important;
                        break-after: page !important;
                    }
                }
            `}</style>

            {/* Control Bar (No Print) */}
            <div className="no-print" style={{
                position: 'sticky',
                top: 0,
                zIndex: 50,
                backgroundColor: '#FFFFFF',
                borderBottom: '1px solid #E2E8F0',
                padding: '0.85rem 1.5rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <button
                        onClick={() => router.back()}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            backgroundColor: '#F8FAFC',
                            border: '1px solid #CBD5E1',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            color: '#334155'
                        }}
                    >
                        <ArrowLeft size={16} /> Volver
                    </button>

                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ClipboardList size={20} color="#0D7A57" />
                            Toma Física de Inventario a Ciegas (INVENTARIO.pdf)
                        </h1>
                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                            Conteo físico a las 16:00 &bull; 6 Folios independientes por Grupo &bull; Poka-Yoke Ciego
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '4px 10px' }}>
                        <Calendar size={14} color="#64748B" />
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569' }}>Fecha Conteo:</span>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            style={{ border: 'none', background: 'transparent', fontSize: '0.8rem', fontWeight: '700', color: '#0F172A', outline: 'none' }}
                        />
                    </div>

                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '4px 10px' }}>
                        <Filter size={14} color="#64748B" />
                        <select
                            value={selectedGroup}
                            onChange={(e) => setSelectedGroup(e.target.value)}
                            style={{ border: 'none', background: 'transparent', fontSize: '0.8rem', fontWeight: '700', color: '#0F172A', outline: 'none' }}
                        >
                            <option value="ALL">Todos los Grupos ({availableGroups.length})</option>
                            {availableGroups.map(g => (
                                <option key={g} value={g}>{g}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={() => {
                            if (printDocRef.current) {
                                printViaNewWindow({
                                    element: printDocRef.current,
                                    title: `Conteo_Fisico_${selectedDate}`,
                                    paperSize: 'letter',
                                    orientation: 'portrait',
                                    margin: '1.0cm 1.2cm'
                                });
                            }
                        }}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 18px',
                            backgroundColor: '#0D7A57',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: '800',
                            boxShadow: '0 2px 8px rgba(13, 122, 87, 0.3)'
                        }}
                    >
                        <Printer size={16} /> Imprimir Folios
                    </button>
                </div>
            </div>

            {/* Document Body */}
            <div ref={printDocRef} style={{ maxWidth: '850px', margin: '1.5rem auto', padding: '0 1rem' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '4rem', color: '#64748B' }}>
                        <p style={{ fontWeight: '700' }}>Cargando catálogo para conteo ciego...</p>
                    </div>
                ) : filteredGroups.map((groupName, gIdx) => {
                    const groupItems = grouped[groupName] || [];

                    return (
                        <div
                            key={groupName}
                            className="page-break"
                            style={{
                                backgroundColor: '#FFFFFF',
                                padding: '14px 18px',
                                marginBottom: '20px',
                                borderRadius: '8px',
                                border: '1px solid #E2E8F0',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
                            }}
                        >
                            <UniversalLetterhead
                                brand={INVESTMENTS_CORTES_BRAND}
                                paperSize="letter"
                                meta={{
                                    title: 'PLANILLA DE CONTEO FÍSICO A CIEGAS',
                                    subtitle: `GRUPO: ${groupName} · TURNO 16:00 HRS`,
                                    date: selectedDate,
                                    reference: `GRUPO ${gIdx + 1}/${availableGroups.length}`,
                                    badge: groupName,
                                    badgeVariant: 'dark'
                                }}
                            >
                                {/* Poka Yoke Notice */}
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    backgroundColor: '#F8FAFC',
                                    padding: '4px 8px',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '4px',
                                    fontSize: '0.66rem',
                                    marginBottom: '6px'
                                }}>
                                    <div>
                                        <strong>Poka-Yoke de Conteo Ciego:</strong> Cuente físicamente en estibas y canastillas sin consultar el sistema. Registre peso o unidades reales.
                                    </div>
                                    <div style={{ whiteSpace: 'nowrap', fontWeight: '800', color: '#0F172A' }}>
                                        {groupItems.length} Referencias Activas
                                    </div>
                                </div>

                                {/* Table */}
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#0F172A', color: '#FFFFFF' }}>
                                            <th style={{ width: '22px', textAlign: 'center', padding: '3px 2px', border: '1px solid #0F172A' }}>#</th>
                                            <th style={{ textAlign: 'left', padding: '3px 6px', border: '1px solid #0F172A' }}>Producto / Variedad</th>
                                            <th style={{ width: '60px', textAlign: 'center', padding: '3px 2px', border: '1px solid #0F172A' }}>SKU</th>
                                            <th style={{ width: '32px', textAlign: 'center', padding: '3px 2px', border: '1px solid #0F172A' }}>UM</th>
                                            <th style={{ width: '85px', textAlign: 'center', padding: '3px 4px', border: '1px solid #0F172A' }}>Estiba / Ubic.</th>
                                            <th style={{ width: '75px', textAlign: 'center', padding: '3px 4px', border: '1px solid #0F172A', backgroundColor: '#0D7A57' }}>Conteo 1 (KG/UN)</th>
                                            <th style={{ width: '75px', textAlign: 'center', padding: '3px 4px', border: '1px solid #0F172A', backgroundColor: '#1E293B' }}>Conteo 2 (Doble)</th>
                                            <th style={{ width: '85px', textAlign: 'center', padding: '3px 4px', border: '1px solid #0F172A' }}>Estado Calidad</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {groupItems.map((p, pIdx) => {
                                            const bg = pIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
                                            return (
                                                <tr key={p.id} style={{ backgroundColor: bg }}>
                                                    <td style={{ textAlign: 'center', padding: '2.5px 2px', border: '1px solid #E2E8F0', fontWeight: '700', color: '#64748B' }}>
                                                        {pIdx + 1}
                                                    </td>
                                                    <td style={{ textAlign: 'left', padding: '2.5px 6px', border: '1px solid #E2E8F0' }}>
                                                        <strong style={{ color: '#0F172A' }}>{p.name}</strong>
                                                    </td>
                                                    <td style={{ textAlign: 'center', padding: '2.5px 2px', border: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.62rem' }}>
                                                        {p.sku || '-'}
                                                    </td>
                                                    <td style={{ textAlign: 'center', padding: '2.5px 2px', border: '1px solid #E2E8F0', color: '#475569' }}>
                                                        {p.unit_of_measure || 'KG'}
                                                    </td>
                                                    <td style={{ textAlign: 'center', padding: '2.5px 2px', border: '1px solid #CBD5E1', borderBottom: '1px dashed #94A3B8' }}>
                                                        ____________
                                                    </td>
                                                    <td style={{ textAlign: 'center', padding: '2.5px 2px', border: '1px solid #CBD5E1', borderBottom: '1px dashed #94A3B8', fontWeight: 'bold' }}>
                                                        [ ________ ]
                                                    </td>
                                                    <td style={{ textAlign: 'center', padding: '2.5px 2px', border: '1px solid #CBD5E1', borderBottom: '1px dashed #94A3B8' }}>
                                                        [ ________ ]
                                                    </td>
                                                    <td style={{ textAlign: 'center', padding: '2.5px 2px', border: '1px solid #E2E8F0', fontSize: '0.58rem', color: '#475569' }}>
                                                        [ ] Ok  [ ] Merma
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>

                                {/* Footer Signatures */}
                                <div style={{
                                    marginTop: '12px',
                                    paddingTop: '6px',
                                    borderTop: '1px solid #CBD5E1',
                                    display: 'grid',
                                    gridTemplateColumns: '1.2fr 1.2fr 1fr',
                                    gap: '12px',
                                    fontSize: '0.62rem'
                                }}>
                                    <div>
                                        <strong>Auxiliar Responsable del Conteo:</strong> ___________________________
                                        <div style={{ fontSize: '0.54rem', color: '#64748B', marginTop: '2px' }}>Nombre legible y firma</div>
                                    </div>
                                    <div>
                                        <strong>Auditor / Líder de Bodega:</strong> ___________________________
                                        <div style={{ fontSize: '0.54rem', color: '#64748B', marginTop: '2px' }}>Aprobación y verificación de diferencias</div>
                                    </div>
                                    <div style={{ textAlign: 'right', fontWeight: 'bold', color: '#0F172A' }}>
                                        Hora Inicio: ____:____ &bull; Fin: ____:____
                                    </div>
                                </div>
                            </UniversalLetterhead>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
