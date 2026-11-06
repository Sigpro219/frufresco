'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
    parseSusceptibleAccountingIds,
    isProductWasteSusceptible
} from '@/lib/inventory/wasteSusceptibleCatalog';
import { Printer } from 'lucide-react';

interface WasteFormatPrintButtonProps {
    deliveryDate: string;
}

interface PrintableCatalogProduct {
    id: string;
    name: string;
    sku?: string | null;
    accounting_id?: number | string | null;
    category?: string | null;
    inventory_group?: string | null;
    unit_of_measure?: string | null;
    parent_id?: string | null;
}

interface PrintableOrderRecord {
    id: string;
    order_items?: Array<{
        product_id?: string | null;
        quantity?: number | string | null;
    }> | null;
}

export default function WasteFormatPrintButton({ deliveryDate }: WasteFormatPrintButtonProps) {
    const [printing, setPrinting] = useState(false);

    const handlePrintFormat = async () => {
        setPrinting(true);
        try {
            const targetDate = deliveryDate || new Date().toISOString().split('T')[0];

            const [settingsRes, catalogRes, ordersRes] = await Promise.all([
                supabase
                    .from('app_settings')
                    .select('value')
                    .eq('key', 'waste_susceptible_products')
                    .maybeSingle(),
                supabase
                    .from('products')
                    .select('id, name, sku, accounting_id, category, inventory_group, unit_of_measure, parent_id')
                    .eq('is_active', true),
                supabase
                    .from('orders')
                    .select('id, delivery_date, status, order_items (product_id, quantity)')
                    .eq('delivery_date', targetDate)
                    .neq('status', 'cancelled')
            ]);

            const susceptibleAccIds = parseSusceptibleAccountingIds(settingsRes.data?.value);
            const allProducts = (catalogRes.data || []) as PrintableCatalogProduct[];
            const productsById = new Map<string, PrintableCatalogProduct>();
            allProducts.forEach((p) => productsById.set(p.id, p));

            // Sum ordered quantities per product for the day
            const orderedQtyByProd = new Map<string, number>();
            const typedOrders = (ordersRes.data || []) as PrintableOrderRecord[];
            typedOrders.forEach((ord) => {
                (ord.order_items || []).forEach((oi) => {
                    if (!oi.product_id) return;
                    const prev = orderedQtyByProd.get(oi.product_id) || 0;
                    orderedQtyByProd.set(oi.product_id, prev + (Number(oi.quantity) || 0));
                });
            });

            // Filter products that are in today's orders AND are waste-susceptible (or if no orders yet on targetDate, print the susceptible catalog)
            let printableItems = Array.from(orderedQtyByProd.entries())
                .map(([prodId, totalOrdered]) => {
                    const p = productsById.get(prodId);
                    if (!p) return null;
                    if (!isProductWasteSusceptible(p, susceptibleAccIds, productsById)) return null;
                    return {
                        accountingId: p.accounting_id ?? 'S/N',
                        cellGroup: p.inventory_group || p.category || 'GENERAL',
                        name: p.name,
                        uom: p.unit_of_measure || 'Kg',
                        orderedQty: Number(totalOrdered.toFixed(2))
                    };
                })
                .filter(Boolean) as Array<{
                    accountingId: number | string;
                    cellGroup: string;
                    name: string;
                    uom: string;
                    orderedQty: number;
                }>;

            if (printableItems.length === 0) {
                printableItems = allProducts
                    .filter((p) => isProductWasteSusceptible(p, susceptibleAccIds, productsById) && (!p.parent_id || p.parent_id === p.id))
                    .map((p) => ({
                        accountingId: p.accounting_id ?? 'S/N',
                        cellGroup: p.inventory_group || p.category || 'GENERAL',
                        name: p.name,
                        uom: p.unit_of_measure || 'Kg',
                        orderedQty: 0
                    }));
            }

            printableItems.sort((a, b) => {
                const c = a.cellGroup.localeCompare(b.cellGroup);
                if (c !== 0) return c;
                return a.name.localeCompare(b.name);
            });

            const rowsHtml = printableItems.map((item, idx) => `
                <tr>
                    <td style="text-align:center;font-weight:800;">${idx + 1}</td>
                    <td style="text-align:center;font-weight:800;">#${item.accountingId}</td>
                    <td style="font-size:10px;color:#334155;">${item.cellGroup}</td>
                    <td style="font-weight:800;color:#0F172A;">${item.name}</td>
                    <td style="text-align:right;font-weight:700;">${item.orderedQty > 0 ? `${item.orderedQty} ${item.uom}` : '—'}</td>
                    <td style="height:26px;border:1.5px solid #0F172A;"></td>
                    <td style="height:26px;border:1.5px solid #0F172A;"></td>
                </tr>
            `).join('');

            const win = window.open('', '_blank', 'width=960,height=780');
            if (!win) {
                alert('Por favor permite ventanas emergentes para imprimir el Formato de Desperdicio y Basura.');
                return;
            }

            win.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8" />
                    <title>Formato de Desperdicio y Basura - ${targetDate}</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 18px; color: #0F172A; }
                        h1 { font-size: 16px; margin: 0 0 4px 0; text-transform: uppercase; }
                        .meta { font-size: 11px; color: #475569; margin-bottom: 12px; display: flex; justify-content: space-between; }
                        table { width: 100%; border-collapse: collapse; font-size: 11px; }
                        th, td { border: 1px solid #475569; padding: 5px 7px; }
                        th { background: #E2E8F0; text-transform: uppercase; font-size: 10px; letter-spacing: 0.03em; }
                        @media print {
                            @page { size: portrait; margin: 10mm; }
                        }
                    </style>
                </head>
                <body>
                    <h1>FRUFRESCO — FORMATO DE DESPERDICIO Y BASURA DEL PEDIDO (BICOLUMNA IA)</h1>
                    <div class="meta">
                        <span><strong>Fecha de Operación:</strong> ${targetDate}</span>
                        <span><strong>Productos Susceptibles Listados:</strong> ${printableItems.length}</span>
                        <span><strong>Responsable Piso:</strong> ____________________________</span>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th style="width:32px;">#</th>
                                <th style="width:65px;">ID</th>
                                <th style="width:160px;">Célula / Grupo</th>
                                <th>Producto Susceptible</th>
                                <th style="width:85px;">Pedido Día</th>
                                <th style="width:135px;background:#FEE2E2;">DESPERDICIO (Kg)<br/><small>(Columna Q)</small></th>
                                <th style="width:135px;background:#FEF3C7;">BASURA / MERMA (Kg)<br/><small>(Columna R)</small></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                    <script>
                        window.onload = function() { window.print(); };
                    </script>
                </body>
                </html>
            `);
            win.document.close();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error desconocido';
            alert('Error generando formato de desperdicio: ' + msg);
        } finally {
            setPrinting(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handlePrintFormat}
            disabled={printing}
            style={{
                padding: '0.48rem 0.9rem',
                borderRadius: '10px',
                border: '1.5px solid #D97706',
                backgroundColor: '#FFFBEB',
                color: '#B45309',
                fontSize: '0.78rem',
                fontWeight: 800,
                cursor: printing ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 1px 3px rgba(217, 119, 6, 0.15)'
            }}
            title="Imprimir Formato Bicolumna de Productos Susceptibles del Pedido (Desperdicio Col Q + Basura Col R)"
        >
            <Printer size={14} strokeWidth={2.3} />
            <span>{printing ? 'Generando...' : 'Formato Desperdicio / Basura (Q y R)'}</span>
        </button>
    );
}
