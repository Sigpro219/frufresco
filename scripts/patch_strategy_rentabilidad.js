const fs = require('fs');

const filePath = 'C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco/src/components/admin/StrategyControlTower.tsx';
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

// 1. Add paretoSort state
const oldCommercialTimelineMetric = `    // View metric selector inside Commercial Timeline
    const [commercialTimelineMetric, setCommercialTimelineMetric] = useState<'sales' | 'kg' | 'orders' | 'profit'>('sales');`;

const newCommercialTimelineMetric = `    // View metric selector inside Commercial Timeline
    const [commercialTimelineMetric, setCommercialTimelineMetric] = useState<'sales' | 'kg' | 'orders' | 'profit'>('sales');
    const [paretoSort, setParetoSort] = useState<'spend' | 'profit' | 'margin' | 'volume'>('spend');`;

if (!content.includes(oldCommercialTimelineMetric)) {
    console.error('commercialTimelineMetric not found');
    process.exit(1);
}
content = content.replace(oldCommercialTimelineMetric, newCommercialTimelineMetric);

// 2. In crmMetrics, replace clientSpendMap calculation
const oldCrmBlock = `        const clientSpendMap = new Map<string, { profile: any; totalSpend: number; ordersCount: number; totalKg: number; lastOrderDate: string }>();

        orders.forEach(o => {
            const prof = profileMap.get(o.profile_id);
            const existing = clientSpendMap.get(o.profile_id) || {
                profile: prof,
                totalSpend: 0,
                ordersCount: 0,
                totalKg: 0,
                lastOrderDate: o.created_at
            };

            const spend = Number(o.total) || 0;
            const kg = Number(o.total_weight_kg) || 0;

            clientSpendMap.set(o.profile_id, {
                ...existing,
                totalSpend: existing.totalSpend + spend,
                ordersCount: existing.ordersCount + 1,
                totalKg: existing.totalKg + kg,
                lastOrderDate: o.created_at > existing.lastOrderDate ? o.created_at : existing.lastOrderDate
            });
        });

        const topClients = Array.from(clientSpendMap.values())
            .sort((a, b) => b.totalSpend - a.totalSpend)
            .slice(0, 10);`;

const newCrmBlock = `        // Index orderItems by order_id and costMatrix by product_id
        const itemsByOrder = new Map<string, any[]>();
        orderItems.forEach(it => {
            if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
            itemsByOrder.get(it.order_id)!.push(it);
        });

        const matrixCostMap = new Map<string, number>();
        costMatrix.forEach(m => {
            if (m.manual_cost && Number(m.manual_cost) > 0) {
                matrixCostMap.set(m.product_id, Number(m.manual_cost));
            }
        });

        const clientSpendMap = new Map<string, { 
            profile: any; 
            totalSpend: number; 
            totalCost: number;
            grossProfit: number;
            marginPct: number;
            ordersCount: number; 
            totalKg: number; 
            lastOrderDate: string 
        }>();

        orders.forEach(o => {
            const prof = profileMap.get(o.profile_id);
            const existing = clientSpendMap.get(o.profile_id) || {
                profile: prof,
                totalSpend: 0,
                totalCost: 0,
                grossProfit: 0,
                marginPct: 0,
                ordersCount: 0,
                totalKg: 0,
                lastOrderDate: o.created_at
            };

            const spend = Number(o.total) || 0;
            const kg = Number(o.total_weight_kg) || 0;

            // Compute order cost
            const oItems = itemsByOrder.get(o.id) || [];
            let orderCost = 0;
            oItems.forEach(it => {
                const qty = Number(it.quantity || 0);
                const price = Number(it.unit_price || 0);
                const unitCost = matrixCostMap.get(it.product_id) || (price > 0 ? price * 0.70 : 0);
                orderCost += qty * unitCost;
            });
            if (orderCost === 0 && spend > 0) {
                orderCost = spend * 0.70;
            }

            const updatedSpend = existing.totalSpend + spend;
            const updatedCost = existing.totalCost + orderCost;
            const updatedProfit = updatedSpend - updatedCost;
            const updatedMargin = updatedSpend > 0 ? (updatedProfit / updatedSpend) * 100 : 0;

            clientSpendMap.set(o.profile_id, {
                ...existing,
                totalSpend: updatedSpend,
                totalCost: updatedCost,
                grossProfit: updatedProfit,
                marginPct: updatedMargin,
                ordersCount: existing.ordersCount + 1,
                totalKg: existing.totalKg + kg,
                lastOrderDate: o.created_at > existing.lastOrderDate ? o.created_at : existing.lastOrderDate
            });
        });

        const topClients = Array.from(clientSpendMap.values())
            .sort((a, b) => {
                if (paretoSort === 'profit') return b.grossProfit - a.grossProfit;
                if (paretoSort === 'margin') return b.marginPct - a.marginPct;
                if (paretoSort === 'volume') return b.totalKg - a.totalKg;
                return b.totalSpend - a.totalSpend;
            })
            .slice(0, 15);`;

if (!content.includes(oldCrmBlock)) {
    console.error('oldCrmBlock not found');
    process.exit(1);
}
content = content.replace(oldCrmBlock, newCrmBlock);

// 3. Update useMemo deps for crmMetrics
const oldDeps = `    }, [orders, profiles, quotes, leads, profileMap]);`;
const newDeps = `    }, [orders, profiles, quotes, leads, profileMap, orderItems, costMatrix, paretoSort]);`;
if (!content.includes(oldDeps)) {
    console.error('oldDeps not found');
    process.exit(1);
}
content = content.replace(oldDeps, newDeps);

// 4. Update the Pareto Table JSX
const oldTableBlock = `                    {/* ── BI SECTION 2: TOP CLIENTES & CONCENTRACIÓN DE FACTURACIÓN ── */}
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        padding: '1.25rem 1.5rem',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '850', color: '#0F172A' }}>
                                Concentración de Facturación por Cliente (Pareto de Cartera)
                            </h3>
                            <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748B' }}>
                                Top Cuentas Estratégicas
                            </span>
                        </div>
                        <p style={{ margin: '0 0 1rem 0', fontSize: '0.76rem', color: '#64748B' }}>
                            Clientes de mayor impacto en facturación y volumen movilizado durante el período.
                        </p>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#64748B', textAlign: 'left' }}>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800' }}>Cliente / Empresa</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800' }}>Tipo</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'center' }}>Órdenes</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'right' }}>Volumen (Kg)</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'right' }}>Total Facturado ($)</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'center' }}>Participación</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {crmMetrics.topClients.map((c, i) => {
                                        const sharePct = commercialMetrics.totalSales > 0 ? ((c.totalSpend / commercialMetrics.totalSales) * 100).toFixed(1) : '0';
                                        const isB2B = c.profile?.role === 'b2b_client' || !!c.profile?.company_name;
                                        return (
                                            <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '0.65rem 0.5rem', fontWeight: '800', color: '#0F172A' }}>
                                                    {c.profile?.company_name || c.profile?.contact_name || 'Cliente Particular'}
                                                </td>
                                                <td style={{ padding: '0.65rem 0.5rem' }}>
                                                    <span style={{
                                                        padding: '2px 7px',
                                                        borderRadius: '6px',
                                                        fontSize: '0.68rem',
                                                        fontWeight: '800',
                                                        backgroundColor: isB2B ? '#EFF6FF' : '#F1F5F9',
                                                        color: isB2B ? '#1E40AF' : '#475569'
                                                    }}>
                                                        {isB2B ? 'B2B Institucional' : 'B2C Hogar'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center', fontWeight: '700', color: '#334155' }}>
                                                    {c.ordersCount}
                                                </td>
                                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', color: '#334155' }}>
                                                    {formatNumber(c.totalKg, 1)} Kg
                                                </td>
                                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: '850', color: '#059669' }}>
                                                    {formatMoney(c.totalSpend)}
                                                </td>
                                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center' }}>
                                                    <span style={{ fontWeight: '800', color: '#2563EB', backgroundColor: '#EFF6FF', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>
                                                        {sharePct}%
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>`;

const newTableBlock = `                    {/* ── BI SECTION 2: TOP CLIENTES & CONCENTRACIÓN DE FACTURACIÓN Y RENTABILIDAD ── */}
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        padding: '1.25rem 1.5rem',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '850', color: '#0F172A' }}>
                                    Concentración de Facturación y Rentabilidad por Cliente (Pareto de Cartera)
                                </h3>
                                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.76rem', color: '#64748B' }}>
                                    Clientes de mayor impacto en facturación, margen operativo y volumen movilizado.
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#64748B' }}>Ordenar por:</span>
                                <button
                                    onClick={() => setParetoSort('spend')}
                                    style={{
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        fontSize: '0.68rem',
                                        fontWeight: '800',
                                        border: 'none',
                                        cursor: 'pointer',
                                        backgroundColor: paretoSort === 'spend' ? '#0F172A' : '#F1F5F9',
                                        color: paretoSort === 'spend' ? '#FFFFFF' : '#475569'
                                    }}
                                >
                                    Mayor Venta ($)
                                </button>
                                <button
                                    onClick={() => setParetoSort('profit')}
                                    style={{
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        fontSize: '0.68rem',
                                        fontWeight: '800',
                                        border: 'none',
                                        cursor: 'pointer',
                                        backgroundColor: paretoSort === 'profit' ? '#0D7A57' : '#F1F5F9',
                                        color: paretoSort === 'profit' ? '#FFFFFF' : '#475569'
                                    }}
                                >
                                    Mayor Utilidad ($)
                                </button>
                                <button
                                    onClick={() => setParetoSort('margin')}
                                    style={{
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        fontSize: '0.68rem',
                                        fontWeight: '800',
                                        border: 'none',
                                        cursor: 'pointer',
                                        backgroundColor: paretoSort === 'margin' ? '#2563EB' : '#F1F5F9',
                                        color: paretoSort === 'margin' ? '#FFFFFF' : '#475569'
                                    }}
                                >
                                    Mayor % Margen
                                </button>
                                <button
                                    onClick={() => setParetoSort('volume')}
                                    style={{
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        fontSize: '0.68rem',
                                        fontWeight: '800',
                                        border: 'none',
                                        cursor: 'pointer',
                                        backgroundColor: paretoSort === 'volume' ? '#475569' : '#F1F5F9',
                                        color: paretoSort === 'volume' ? '#FFFFFF' : '#475569'
                                    }}
                                >
                                    Mayor Volumen (Kg)
                                </button>
                            </div>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#64748B', textAlign: 'left' }}>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800' }}>Cliente / Empresa</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800' }}>Tipo</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'center' }}>Órdenes</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'right' }}>Volumen (Kg)</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'right' }}>Total Facturado ($)</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'right' }}>Utilidad Bruta ($)</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'center' }}>% Rentabilidad</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'center' }}>Participación</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {crmMetrics.topClients.map((c, i) => {
                                        const sharePct = commercialMetrics.totalSales > 0 ? ((c.totalSpend / commercialMetrics.totalSales) * 100).toFixed(1) : '0';
                                        const isB2B = c.profile?.role === 'b2b_client' || !!c.profile?.company_name;
                                        return (
                                            <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '0.65rem 0.5rem', fontWeight: '800', color: '#0F172A' }}>
                                                    {c.profile?.company_name || c.profile?.contact_name || 'Cliente Particular'}
                                                </td>
                                                <td style={{ padding: '0.65rem 0.5rem' }}>
                                                    <span style={{
                                                        padding: '2px 7px',
                                                        borderRadius: '6px',
                                                        fontSize: '0.68rem',
                                                        fontWeight: '800',
                                                        backgroundColor: isB2B ? '#EFF6FF' : '#F1F5F9',
                                                        color: isB2B ? '#1E40AF' : '#475569'
                                                    }}>
                                                        {isB2B ? 'B2B Institucional' : 'B2C Hogar'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center', fontWeight: '700', color: '#334155' }}>
                                                    {c.ordersCount}
                                                </td>
                                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', color: '#334155' }}>
                                                    {formatNumber(c.totalKg, 1)} Kg
                                                </td>
                                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: '850', color: '#0F172A' }}>
                                                    {formatMoney(c.totalSpend)}
                                                </td>
                                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: '850', color: c.grossProfit >= 0 ? '#0D7A57' : '#DC2626' }}>
                                                    {formatMoney(c.grossProfit)}
                                                </td>
                                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center' }}>
                                                    <span style={{
                                                        fontWeight: '900',
                                                        fontSize: '0.72rem',
                                                        padding: '2px 8px',
                                                        borderRadius: '6px',
                                                        backgroundColor: c.marginPct >= 25 ? '#DCFCE7' : (c.marginPct >= 15 ? '#FEF3C7' : '#FEE2E2'),
                                                        color: c.marginPct >= 25 ? '#15803D' : (c.marginPct >= 15 ? '#B45309' : '#B91C1C'),
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '2px'
                                                    }}>
                                                        {c.marginPct.toFixed(1)}%
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center' }}>
                                                    <span style={{ fontWeight: '800', color: '#2563EB', backgroundColor: '#EFF6FF', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>
                                                        {sharePct}%
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>`;

if (!content.includes(oldTableBlock)) {
    console.error('oldTableBlock not found');
    process.exit(1);
}
content = content.replace(oldTableBlock, newTableBlock);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched StrategyControlTower.tsx!');
