'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Printer, ArrowLeft, Calendar, Filter, Truck } from 'lucide-react';
import GoldenPrintStyles from '@/components/print/GoldenPrintStyles';
import UniversalLetterhead from '@/components/print/UniversalLetterhead';
import { INVESTMENTS_CORTES_BRAND } from '@/components/print/presets';
import { printViaNewWindow } from '@/components/print';

interface ReceivingItem {
    id: string;
    product_id: string;
    product_name: string;
    variant_label?: string;
    sku?: string;
    sublist: string;
    unit: string;
    ordered_qty: number;
}

export default function ReceivingPrintPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const paramDate = searchParams.get('date');
    const printDocRef = useRef<HTMLDivElement>(null);

    const [selectedDate, setSelectedDate] = useState<string>(() => {
        if (paramDate) return paramDate;
        const now = new Date();
        return now.toISOString().split('T')[0];
    });

    const [selectedSublist, setSelectedSublist] = useState<string>('ALL');
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<ReceivingItem[]>([]);

    useEffect(() => {
        fetchReceivingData();
    }, [selectedDate]);

    const fetchReceivingData = async () => {
        setLoading(true);
        try {
            // Fetch procurement tasks
            const { data: tasksData } = await supabase
                .from('procurement_tasks')
                .select('*')
                .eq('delivery_date', selectedDate);

            let rawTasks = tasksData || [];

            // If empty, fallback to order_items
            if (rawTasks.length === 0) {
                const { data: ordersWithItems } = await supabase
                    .from('orders')
                    .select('id, delivery_date, order_items(id, product_id, quantity, unit, nickname, variant_label)')
                    .eq('delivery_date', selectedDate)
                    .neq('status', 'cancelled');

                if (ordersWithItems) {
                    const map: Record<string, any> = {};
                    ordersWithItems.forEach((ord: any) => {
                        (ord.order_items || []).forEach((it: any) => {
                            const pId = it.product_id;
                            if (!pId) return;
                            if (!map[pId]) {
                                map[pId] = {
                                    id: it.id,
                                    product_id: pId,
                                    total_requested: 0,
                                    variant_label: it.variant_label,
                                    unit: it.unit
                                };
                            }
                            map[pId].total_requested += Number(it.quantity) || 0;
                        });
                    });
                    rawTasks = Object.values(map);
                }
            }

            if (rawTasks.length === 0) {
                setItems([]);
                setLoading(false);
                return;
            }

            // Products detail
            const productIds = Array.from(new Set(rawTasks.map((t: any) => t.product_id).filter(Boolean)));
            const { data: products } = await supabase
                .from('products')
                .select('id, name, sku, unit_of_measure, purchase_sublist')
                .in('id', productIds);

            const prodMap: Record<string, any> = {};
            (products || []).forEach((p: any) => {
                prodMap[p.id] = p;
            });

            const parsed: ReceivingItem[] = rawTasks.map((t: any) => {
                const p = prodMap[t.product_id];
                return {
                    id: t.id,
                    product_id: t.product_id,
                    product_name: p?.name || 'Producto Desconocido',
                    variant_label: t.variant_label,
                    sku: p?.sku || '',
                    sublist: (p?.purchase_sublist || 'GENERAL CORABASTOS').toUpperCase().trim(),
                    unit: p?.unit_of_measure || t.unit || 'KG',
                    ordered_qty: Number(t.total_requested) || 0
                };
            });

            parsed.sort((a, b) => {
                if (a.sublist !== b.sublist) return a.sublist.localeCompare(b.sublist);
                return a.product_name.localeCompare(b.product_name);
            });

            setItems(parsed);

        } catch (err) {
            console.error('Error cargando datos de ingreso a muelle:', err);
        } finally {
            setLoading(false);
        }
    };

    // Group by sublist
    const grouped = useMemo(() => {
        const map: Record<string, ReceivingItem[]> = {};
        items.forEach(it => {
            if (!map[it.sublist]) map[it.sublist] = [];
            map[it.sublist].push(it);
        });
        return map;
    }, [items]);

    const availableSublists = useMemo(() => Object.keys(grouped).sort(), [grouped]);

    const filteredSublists = useMemo(() => {
        if (selectedSublist === 'ALL') return availableSublists;
        return availableSublists.filter(s => s === selectedSublist);
    }, [availableSublists, selectedSublist]);

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
                            <Truck size={20} color="#0D7A57" />
                            Control de Ingreso en Muelle & Pesaje a Ciegas (INGRESO.pdf)
                        </h1>
                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                            Recepción de camiones a las 02:00 AM &bull; Pesaje bruto, tara y neto real &bull; Cero errores
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '4px 10px' }}>
                        <Calendar size={14} color="#64748B" />
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569' }}>Fecha:</span>
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
                            value={selectedSublist}
                            onChange={(e) => setSelectedSublist(e.target.value)}
                            style={{ border: 'none', background: 'transparent', fontSize: '0.8rem', fontWeight: '700', color: '#0F172A', outline: 'none' }}
                        >
                            <option value="ALL">Todas las Sublistas ({availableSublists.length})</option>
                            {availableSublists.map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={() => {
                            if (printDocRef.current) {
                                printViaNewWindow({
                                    element: printDocRef.current,
                                    title: `Ingreso_Muelle_${selectedDate}`,
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
                        <Printer size={16} /> Imprimir Planillas de Muelle
                    </button>
                </div>
            </div>

            {/* Document Body */}
            <div ref={printDocRef} style={{ maxWidth: '850px', margin: '1.5rem auto', padding: '0 1rem' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '4rem', color: '#64748B' }}>
                        <p style={{ fontWeight: '700' }}>Cargando datos de recepción nocturna...</p>
                    </div>
                ) : filteredSublists.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                        <p style={{ fontSize: '1rem', fontWeight: '800', color: '#0F172A' }}>No hay mercancía programada para recepción en esta fecha.</p>
                        <p style={{ fontSize: '0.82rem', color: '#64748B' }}>Selecciona otra fecha de entrega en el panel superior.</p>
                    </div>
                ) : filteredSublists.map((sublistName) => {
                    const sublistItems = grouped[sublistName] || [];

                    return (
                        <div
                            key={sublistName}
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
                                    title: 'INGRESO DE MERCANCÍA & CONTROL DE MUELLE (02:00 AM)',
                                    subtitle: `SUBLISTA: ${sublistName} · PESAJE EN PLATAFORMA`,
                                    date: selectedDate,
                                    reference: `MUELLE-RECIBO: ${sublistName}`,
                                    badge: sublistName,
                                    badgeVariant: 'dark'
                                }}
                            >
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
                                        <strong>Protocolo de Muelle:</strong> Pese camión o estibas por separado. Reste la tara de canastillas plásticas (1.8 kg c/u) y empaques. Verifique madurez y temperatura.
                                    </div>
                                    <div style={{ whiteSpace: 'nowrap', fontWeight: '800', color: '#0F172A' }}>
                                        {sublistItems.length} SKUs a Descargar
                                    </div>
                                </div>

                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.66rem' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#0F172A', color: '#FFFFFF' }}>
                                            <th style={{ width: '22px', textAlign: 'center', padding: '3px 2px', border: '1px solid #0F172A' }}>#</th>
                                            <th style={{ textAlign: 'left', padding: '3px 6px', border: '1px solid #0F172A' }}>Producto / Variedad</th>
                                            <th style={{ width: '30px', textAlign: 'center', padding: '3px 2px', border: '1px solid #0F172A' }}>UM</th>
                                            <th style={{ width: '55px', textAlign: 'center', padding: '3px 2px', border: '1px solid #0F172A' }}>Canastillas</th>
                                            <th style={{ width: '65px', textAlign: 'center', padding: '3px 2px', border: '1px solid #0F172A', backgroundColor: '#1E293B' }}>Peso Bruto (Kg)</th>
                                            <th style={{ width: '60px', textAlign: 'center', padding: '3px 2px', border: '1px solid #0F172A', backgroundColor: '#334155' }}>Tara (Kg)</th>
                                            <th style={{ width: '70px', textAlign: 'center', padding: '3px 2px', border: '1px solid #0F172A', backgroundColor: '#0D7A57' }}>Neto Real (Kg)</th>
                                            <th style={{ width: '70px', textAlign: 'center', padding: '3px 2px', border: '1px solid #0F172A' }}>Calidad</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sublistItems.map((it, idx) => {
                                            const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
                                            return (
                                                <tr key={it.id || idx} style={{ backgroundColor: bg }}>
                                                    <td style={{ textAlign: 'center', padding: '2.5px 2px', border: '1px solid #E2E8F0', fontWeight: '700', color: '#64748B' }}>
                                                        {idx + 1}
                                                    </td>
                                                    <td style={{ textAlign: 'left', padding: '2.5px 6px', border: '1px solid #E2E8F0' }}>
                                                        <strong style={{ color: '#0F172A' }}>{it.product_name}</strong>
                                                        {it.variant_label && <span style={{ fontSize: '0.60rem', color: '#475569', marginLeft: '4px' }}>({it.variant_label})</span>}
                                                    </td>
                                                    <td style={{ textAlign: 'center', padding: '2.5px 2px', border: '1px solid #E2E8F0', color: '#475569' }}>
                                                        {it.unit}
                                                    </td>
                                                    <td style={{ textAlign: 'center', padding: '2.5px 2px', border: '1px solid #CBD5E1', borderBottom: '1px dashed #94A3B8' }}>
                                                        [ _____ ]
                                                    </td>
                                                    <td style={{ textAlign: 'center', padding: '2.5px 2px', border: '1px solid #CBD5E1', borderBottom: '1px dashed #94A3B8' }}>
                                                        [ _____ ]
                                                    </td>
                                                    <td style={{ textAlign: 'center', padding: '2.5px 2px', border: '1px solid #CBD5E1', borderBottom: '1px dashed #94A3B8' }}>
                                                        [ _____ ]
                                                    </td>
                                                    <td style={{ textAlign: 'center', padding: '2.5px 2px', border: '1px solid #CBD5E1', borderBottom: '1px dashed #94A3B8', fontWeight: 'bold' }}>
                                                        [ _____ ]
                                                    </td>
                                                    <td style={{ textAlign: 'center', padding: '2.5px 2px', border: '1px solid #E2E8F0', fontSize: '0.58rem', color: '#475569' }}>
                                                        [ ] Aprob  [ ] Rech
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
                                    gridTemplateColumns: '1fr 1fr 1fr',
                                    gap: '12px',
                                    fontSize: '0.62rem'
                                }}>
                                    <div>
                                        <strong>Conductor de Camión Corabastos:</strong> ___________________________
                                        <div style={{ fontSize: '0.54rem', color: '#64748B', marginTop: '2px' }}>Entrega de carga y canastillas</div>
                                    </div>
                                    <div>
                                        <strong>Auxiliar Báscula de Muelle:</strong> ___________________________
                                        <div style={{ fontSize: '0.54rem', color: '#64748B', marginTop: '2px' }}>Pesaje verificado</div>
                                    </div>
                                    <div>
                                        <strong>Auditor de Calidad Agroindustrial:</strong> ___________________________
                                        <div style={{ fontSize: '0.54rem', color: '#64748B', marginTop: '2px' }}>Visto bueno sanitario y fitosanitario</div>
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
