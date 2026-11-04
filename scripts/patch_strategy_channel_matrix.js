const fs = require('fs');

const filePath = 'C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco/src/components/admin/StrategyControlTower.tsx';
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

// 1. Update commercialMetrics calculation
const oldCommercialMetrics = `    // Metrics calculations for Commercial Area
    const commercialMetrics = useMemo(() => {
        let totalSales = 0;
        let b2bSales = 0;
        let b2cSales = 0;
        let totalKg = 0;

        filteredOrders.forEach(o => {
            const amt = Number(o.total) || 0;
            totalSales += amt;
            const prof = profileMap.get(o.profile_id);
            const isB2B = o.type === 'b2b' || prof?.role === 'b2b_client' || prof?.role === 'institution' || !!prof?.company_name;
            if (isB2B) b2bSales += amt;
            else b2cSales += amt;

            if (o.total_weight_kg) {
                totalKg += Number(o.total_weight_kg);
            }
        });

        const orderIdSet = new Set(filteredOrders.map(o => o.id));
        let totalEstimatedCost = 0;
        let calculatedItemsKg = 0;

        // Product ranking map
        const productVolumeMap = new Map<string, { qty: number; revenue: number; cost: number }>();

        orderItems.forEach(item => {
            if (!orderIdSet.has(item.order_id)) return;
            const q = Number(item.quantity) || 0;
            const unitPrice = Number(item.unit_price) || 0;
            const sub = q * unitPrice;
            const c = costMap.get(item.product_id) || (unitPrice * 0.78); // 22% margin default fallback
            const itemCost = c * q;
            totalEstimatedCost += itemCost;
            calculatedItemsKg += q;

            const existing = productVolumeMap.get(item.product_id) || { qty: 0, revenue: 0, cost: 0 };
            productVolumeMap.set(item.product_id, {
                qty: existing.qty + q,
                revenue: existing.revenue + sub,
                cost: existing.cost + itemCost
            });
        });

        if (totalKg === 0) totalKg = calculatedItemsKg;
        if (totalEstimatedCost === 0 && totalSales > 0) totalEstimatedCost = totalSales * 0.78;

        const grossProfit = totalSales - totalEstimatedCost;
        const marginPct = totalSales > 0 ? Math.round((grossProfit / totalSales) * 100) : 0;
        const avgTicket = filteredOrders.length > 0 ? Math.round(totalSales / filteredOrders.length) : 0;
        const avgKgPerOrder = filteredOrders.length > 0 ? (totalKg / filteredOrders.length).toFixed(1) : '0';

        // Top 10 products
        const topProducts = Array.from(productVolumeMap.entries())
            .map(([pid, val]) => {
                const prod = productMap.get(pid);
                const margin = val.revenue > 0 ? Math.round(((val.revenue - val.cost) / val.revenue) * 100) : 22;
                return {
                    id: pid,
                    name: prod?.name || 'Producto FruFresco',
                    sku: prod?.sku || 'SKU',
                    category: prod?.category || 'General',
                    qty: val.qty,
                    revenue: val.revenue,
                    cost: val.cost,
                    marginPct: margin,
                    profit: val.revenue - val.cost
                };
            })
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

        return {
            totalSales,
            b2bSales,
            b2cSales,
            ordersCount: filteredOrders.length,
            totalKg,
            avgTicket,
            avgKgPerOrder,
            grossProfit,
            marginPct,
            topProducts
        };
    }, [filteredOrders, profileMap, orderItems, costMap, productMap]);`;

const newCommercialMetrics = `    // Metrics calculations for Commercial Area (including channel profitability & mix)
    const commercialMetrics = useMemo(() => {
        let totalSales = 0;
        let b2bSales = 0;
        let b2cSales = 0;
        let b2bOrdersCount = 0;
        let b2cOrdersCount = 0;
        let b2bKg = 0;
        let b2cKg = 0;
        let totalKg = 0;

        const orderIsB2BMap = new Map<string, boolean>();

        filteredOrders.forEach(o => {
            const amt = Number(o.total) || 0;
            totalSales += amt;
            const prof = profileMap.get(o.profile_id);
            const isB2B = o.type === 'b2b' || prof?.role === 'b2b_client' || prof?.role === 'institution' || !!prof?.company_name;
            orderIsB2BMap.set(o.id, isB2B);

            const kg = Number(o.total_weight_kg) || 0;
            totalKg += kg;

            if (isB2B) {
                b2bSales += amt;
                b2bOrdersCount += 1;
                b2bKg += kg;
            } else {
                b2cSales += amt;
                b2cOrdersCount += 1;
                b2cKg += kg;
            }
        });

        const orderIdSet = new Set(filteredOrders.map(o => o.id));
        let totalEstimatedCost = 0;
        let b2bCost = 0;
        let b2cCost = 0;
        let calculatedItemsKg = 0;
        let b2bItemsKg = 0;
        let b2cItemsKg = 0;

        // Product ranking map
        const productVolumeMap = new Map<string, { qty: number; revenue: number; cost: number }>();

        orderItems.forEach(item => {
            if (!orderIdSet.has(item.order_id)) return;
            const q = Number(item.quantity) || 0;
            const unitPrice = Number(item.unit_price) || 0;
            const sub = q * unitPrice;
            const c = costMap.get(item.product_id) || (unitPrice * 0.78); // 22% margin default fallback
            const itemCost = c * q;
            totalEstimatedCost += itemCost;
            calculatedItemsKg += q;

            const isB2B = orderIsB2BMap.get(item.order_id);
            if (isB2B) {
                b2bCost += itemCost;
                b2bItemsKg += q;
            } else {
                b2cCost += itemCost;
                b2cItemsKg += q;
            }

            const existing = productVolumeMap.get(item.product_id) || { qty: 0, revenue: 0, cost: 0 };
            productVolumeMap.set(item.product_id, {
                qty: existing.qty + q,
                revenue: existing.revenue + sub,
                cost: existing.cost + itemCost
            });
        });

        if (totalKg === 0) totalKg = calculatedItemsKg;
        if (totalEstimatedCost === 0 && totalSales > 0) totalEstimatedCost = totalSales * 0.78;
        if (b2bCost === 0 && b2bSales > 0) b2bCost = b2bSales * 0.78;
        if (b2cCost === 0 && b2cSales > 0) b2cCost = b2cSales * 0.78;

        const grossProfit = totalSales - totalEstimatedCost;
        const marginPct = totalSales > 0 ? Math.round((grossProfit / totalSales) * 100) : 0;
        const avgTicket = filteredOrders.length > 0 ? Math.round(totalSales / filteredOrders.length) : 0;
        const avgKgPerOrder = filteredOrders.length > 0 ? (totalKg / filteredOrders.length).toFixed(1) : '0';

        const b2bProfit = b2bSales - b2bCost;
        const b2cProfit = b2cSales - b2cCost;
        const b2bMarginPct = b2bSales > 0 ? ((b2bProfit / b2bSales) * 100) : 0;
        const b2cMarginPct = b2cSales > 0 ? ((b2cProfit / b2cSales) * 100) : 0;
        const b2bAvgTicket = b2bOrdersCount > 0 ? Math.round(b2bSales / b2bOrdersCount) : 0;
        const b2cAvgTicket = b2cOrdersCount > 0 ? Math.round(b2cSales / b2cOrdersCount) : 0;

        // Top 10 products
        const topProducts = Array.from(productVolumeMap.entries())
            .map(([pid, val]) => {
                const prod = productMap.get(pid);
                const margin = val.revenue > 0 ? Math.round(((val.revenue - val.cost) / val.revenue) * 100) : 22;
                return {
                    id: pid,
                    name: prod?.name || 'Producto FruFresco',
                    sku: prod?.sku || 'SKU',
                    category: prod?.category || 'General',
                    qty: val.qty,
                    revenue: val.revenue,
                    cost: val.cost,
                    marginPct: margin,
                    profit: val.revenue - val.cost
                };
            })
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

        return {
            totalSales,
            b2bSales,
            b2cSales,
            b2bCost,
            b2cCost,
            b2bProfit,
            b2cProfit,
            b2bMarginPct,
            b2cMarginPct,
            b2bOrdersCount,
            b2cOrdersCount,
            b2bKg: b2bKg > 0 ? b2bKg : b2bItemsKg,
            b2cKg: b2cKg > 0 ? b2cKg : b2cItemsKg,
            b2bAvgTicket,
            b2cAvgTicket,
            ordersCount: filteredOrders.length,
            totalKg,
            avgTicket,
            avgKgPerOrder,
            grossProfit,
            marginPct,
            topProducts
        };
    }, [filteredOrders, profileMap, orderItems, costMap, productMap]);`;

if (!content.includes(oldCommercialMetrics)) {
    console.error('oldCommercialMetrics not found!');
    process.exit(1);
}
content = content.replace(oldCommercialMetrics, newCommercialMetrics);

// 2. Update Channel Card in JSX
const oldCardBlock = `                        {/* Donut: Distribución B2B vs B2C */}
                        <div style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '16px',
                            border: '1px solid #E2E8F0',
                            padding: '1.25rem 1.5rem',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '850', color: '#0F172A' }}>
                                        Participación por Canal de Venta
                                    </h3>
                                    <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>Segmentación</span>
                                </div>
                                <p style={{ margin: '0 0 1rem 0', fontSize: '0.76rem', color: '#64748B' }}>
                                    Distribución de ingresos entre canal institucional B2B y canal hogar B2C.
                                </p>
                            </div>

                            <BIDonutChart
                                b2bAmount={commercialMetrics.b2bSales}
                                b2cAmount={commercialMetrics.b2cSales}
                                totalAmount={commercialMetrics.totalSales}
                            />
                        </div>`;

const newCardBlock = `                        {/* Participación & Rentabilidad por Canal de Venta (Rediseño de Alta Densidad BI) */}
                        <div style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '16px',
                            border: '1px solid #E2E8F0',
                            padding: '1.25rem 1.5rem',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '0.75rem'
                        }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '850', color: '#0F172A' }}>
                                        Participación &amp; Rentabilidad por Canal
                                    </h3>
                                    <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#0D7A57', backgroundColor: '#DCFCE7', padding: '2px 8px', borderRadius: '6px' }}>
                                        Mix Venta vs Utilidad
                                    </span>
                                </div>
                                <p style={{ margin: '0 0 0.85rem 0', fontSize: '0.76rem', color: '#64748B' }}>
                                    Distribución de ingresos, margen de rentabilidad y utilidad bruta real entre canales.
                                </p>

                                <BIChannelPerformanceMatrix metrics={commercialMetrics} />
                            </div>
                        </div>`;

if (!content.includes(oldCardBlock)) {
    console.error('oldCardBlock not found!');
    process.exit(1);
}
content = content.replace(oldCardBlock, newCardBlock);

// 3. Replace BIDonutChart component with BIChannelPerformanceMatrix
const oldDonutFunction = `function BIDonutChart({
    b2bAmount,
    b2cAmount,
    totalAmount
}: {
    b2bAmount: number;
    b2cAmount: number;
    totalAmount: number;
}) {
    const total = totalAmount || 1;
    const b2bPct = Math.round((b2bAmount / total) * 100);
    const b2cPct = Math.max(100 - b2bPct, 0);

    const circumference = 2 * Math.PI * 38;
    const b2bOffset = circumference * (1 - b2bPct / 100);

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: '1.5rem', flexWrap: 'wrap', padding: '0.5rem 0' }}>
            {/* SVG Donut */}
            <div style={{ position: 'relative', width: '130px', height: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="130" height="130" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="50" cy="50" r="38" fill="transparent" stroke="#0284C7" strokeWidth="12" />
                    <circle
                        cx="50"
                        cy="50"
                        r="38"
                        fill="transparent"
                        stroke="#0D7A57"
                        strokeWidth="12"
                        strokeDasharray={circumference}
                        strokeDashoffset={b2bOffset}
                        strokeLinecap="round"
                    />
                </svg>
                <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: '900', color: '#0F172A', lineHeight: 1 }}>{b2bPct}%</span>
                    <span style={{ fontSize: '0.62rem', fontWeight: '800', color: '#0D7A57', textTransform: 'uppercase' }}>B2B</span>
                </div>
            </div>

            {/* Breakdown Badges */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', flex: '1 1 180px' }}>
                <div style={{ padding: '0.65rem 0.85rem', backgroundColor: '#F0FDF4', borderRadius: '10px', border: '1px solid #DCFCE7' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', fontWeight: '800', color: '#166534' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#0D7A57' }} />
                        <span>Canal Institucional B2B ({b2bPct}%)</span>
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#14532D', marginTop: '2px' }}>
                        {formatMoney(b2bAmount)}
                    </div>
                </div>

                <div style={{ padding: '0.65rem 0.85rem', backgroundColor: '#F0F9FF', borderRadius: '10px', border: '1px solid #E0F2FE' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', fontWeight: '800', color: '#0369A1' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#0284C7' }} />
                        <span>Canal Hogar B2C ({b2cPct}%)</span>
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#075985', marginTop: '2px' }}>
                        {formatMoney(b2cAmount)}
                    </div>
                </div>
            </div>
        </div>
    );
}`;

const newMatrixFunction = `function BIChannelPerformanceMatrix({ metrics }: { metrics: any }) {
    const totalSales = metrics.totalSales || 1;
    const b2bSales = metrics.b2bSales || 0;
    const b2cSales = metrics.b2cSales || 0;

    const b2bSalesMix = Math.min(Math.max((b2bSales / totalSales) * 100, 0), 100);
    const b2cSalesMix = Math.max(100 - b2bSalesMix, 0);

    const grossProfit = metrics.grossProfit || 1;
    const b2bProfit = metrics.b2bProfit || 0;
    const b2cProfit = metrics.b2cProfit || 0;

    const b2bProfitMix = grossProfit > 0 ? Math.min(Math.max((b2bProfit / grossProfit) * 100, 0), 100) : 100;
    const b2cProfitMix = Math.max(100 - b2bProfitMix, 0);

    const b2bMargin = metrics.b2bMarginPct || 0;
    const b2cMargin = metrics.b2cMarginPct || 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {/* 1. BARRAS COMPARATIVAS DUALES (Mix Venta vs Mix Utilidad) */}
            <div style={{
                backgroundColor: '#F8FAFC',
                padding: '0.85rem 1rem',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
            }}>
                {/* Mix Facturación */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.73rem', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: '800', color: '#0F172A' }}>
                            <DollarSign size={13} color="#0D7A57" strokeWidth={2.4} />
                            <span>Mix Facturación ($)</span>
                        </div>
                        <div style={{ fontSize: '0.72rem', fontWeight: '700' }}>
                            <span style={{ color: '#0D7A57' }}>B2B: {b2bSalesMix.toFixed(1)}%</span>
                            <span style={{ margin: '0 4px', color: '#CBD5E1' }}>|</span>
                            <span style={{ color: '#0284C7' }}>B2C: {b2cSalesMix.toFixed(1)}%</span>
                        </div>
                    </div>
                    <div style={{ height: '8px', width: '100%', backgroundColor: '#E2E8F0', borderRadius: '999px', overflow: 'hidden', display: 'flex' }}>
                        <div style={{ width: \`\${b2bSalesMix}%\`, backgroundColor: '#0D7A57', transition: 'width 0.4s ease' }} />
                        <div style={{ width: \`\${b2cSalesMix}%\`, backgroundColor: '#0284C7', transition: 'width 0.4s ease' }} />
                    </div>
                </div>

                {/* Mix Utilidad Bruta */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.73rem', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: '800', color: '#0F172A' }}>
                            <BarChart3 size={13} color="#2563EB" strokeWidth={2.4} />
                            <span>Mix Utilidad Bruta ($)</span>
                        </div>
                        <div style={{ fontSize: '0.72rem', fontWeight: '700' }}>
                            <span style={{ color: '#0D7A57' }}>B2B: {b2bProfitMix.toFixed(1)}%</span>
                            <span style={{ margin: '0 4px', color: '#CBD5E1' }}>|</span>
                            <span style={{ color: '#0284C7' }}>B2C: {b2cProfitMix.toFixed(1)}%</span>
                        </div>
                    </div>
                    <div style={{ height: '8px', width: '100%', backgroundColor: '#E2E8F0', borderRadius: '999px', overflow: 'hidden', display: 'flex' }}>
                        <div style={{ width: \`\${b2bProfitMix}%\`, backgroundColor: '#059669', transition: 'width 0.4s ease' }} />
                        <div style={{ width: \`\${b2cProfitMix}%\`, backgroundColor: '#38BDF8', transition: 'width 0.4s ease' }} />
                    </div>
                </div>
            </div>

            {/* 2. TARJETAS DE DESGLOSE FINANCIERO PROFUNDO POR CANAL */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
                {/* B2B Card */}
                <div style={{
                    padding: '0.85rem 1rem',
                    backgroundColor: '#F0FDF4',
                    borderRadius: '12px',
                    border: '1.5px solid #BBF7D0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    boxShadow: '0 2px 6px rgba(13, 122, 87, 0.04)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Building2 size={16} color="#0D7A57" strokeWidth={2.2} />
                            <span style={{ fontSize: '0.82rem', fontWeight: '850', color: '#14532D' }}>B2B Institucional</span>
                        </div>
                        <span style={{
                            fontSize: '0.68rem',
                            fontWeight: '850',
                            padding: '2px 7px',
                            borderRadius: '6px',
                            backgroundColor: '#DCFCE7',
                            color: '#15803D'
                        }}>
                            {b2bSalesMix.toFixed(1)}% Venta
                        </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '2px' }}>
                        <div>
                            <div style={{ fontSize: '0.65rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>Facturación</div>
                            <div style={{ fontSize: '1.05rem', fontWeight: '900', color: '#0F172A' }}>{formatMoney(b2bSales)}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>Utilidad Bruta</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: '900', color: '#0D7A57' }}>{formatMoney(b2bProfit)}</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', borderTop: '1px solid #DCFCE7' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#166534' }}>
                            % Margen Bruto:
                        </span>
                        <span style={{
                            fontSize: '0.75rem',
                            fontWeight: '900',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            backgroundColor: b2bMargin >= 20 ? '#DCFCE7' : '#FEF3C7',
                            color: b2bMargin >= 20 ? '#15803D' : '#B45309'
                        }}>
                            {b2bMargin.toFixed(1)}%
                        </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#475569', fontWeight: '600', paddingTop: '2px' }}>
                        <span>Órdenes: <strong>{metrics.b2bOrdersCount || 0}</strong></span>
                        <span>Volumen: <strong>{formatNumber(metrics.b2bKg || 0, 0)} Kg</strong></span>
                        <span>Ticket: <strong>{formatMoney(metrics.b2bAvgTicket || 0)}</strong></span>
                    </div>
                </div>

                {/* B2C Card */}
                <div style={{
                    padding: '0.85rem 1rem',
                    backgroundColor: '#F0F9FF',
                    borderRadius: '12px',
                    border: '1.5px solid #BAE6FD',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    boxShadow: '0 2px 6px rgba(2, 132, 199, 0.04)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Home size={16} color="#0284C7" strokeWidth={2.2} />
                            <span style={{ fontSize: '0.82rem', fontWeight: '850', color: '#075985' }}>B2C Hogar</span>
                        </div>
                        <span style={{
                            fontSize: '0.68rem',
                            fontWeight: '850',
                            padding: '2px 7px',
                            borderRadius: '6px',
                            backgroundColor: '#E0F2FE',
                            color: '#0369A1'
                        }}>
                            {b2cSalesMix.toFixed(1)}% Venta
                        </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '2px' }}>
                        <div>
                            <div style={{ fontSize: '0.65rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>Facturación</div>
                            <div style={{ fontSize: '1.05rem', fontWeight: '900', color: '#0F172A' }}>{formatMoney(b2cSales)}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>Utilidad Bruta</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: '900', color: '#0284C7' }}>{formatMoney(b2cProfit)}</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', borderTop: '1px solid #E0F2FE' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#0369A1' }}>
                            % Margen Bruto:
                        </span>
                        <span style={{
                            fontSize: '0.75rem',
                            fontWeight: '900',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            backgroundColor: b2cMargin >= 25 ? '#DCFCE7' : (b2cMargin >= 15 ? '#FEF3C7' : '#FEE2E2'),
                            color: b2cMargin >= 25 ? '#15803D' : (b2cMargin >= 15 ? '#B45309' : '#B91C1C')
                        }}>
                            {b2cMargin.toFixed(1)}%
                        </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#475569', fontWeight: '600', paddingTop: '2px' }}>
                        <span>Órdenes: <strong>{metrics.b2cOrdersCount || 0}</strong></span>
                        <span>Volumen: <strong>{formatNumber(metrics.b2cKg || 0, 0)} Kg</strong></span>
                        <span>Ticket: <strong>{formatMoney(metrics.b2cAvgTicket || 0)}</strong></span>
                    </div>
                </div>
            </div>

            {/* 3. INSIGHT DE INTELIGENCIA DE CANALES */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '0.65rem 0.85rem',
                backgroundColor: '#F8FAFC',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                fontSize: '0.72rem',
                color: '#475569'
            }}>
                <Sparkles size={14} color="#0D7A57" style={{ flexShrink: 0 }} />
                <span>
                    <strong>Lectura Estratégica:</strong> El canal Institucional B2B aporta el <strong>{b2cSalesMix < 100 ? b2bProfitMix.toFixed(1) : '0'}%</strong> de la utilidad neta operativa con margen del <strong>{b2bMargin.toFixed(1)}%</strong>, mientras Hogar B2C registra un margen del <strong>{b2cMargin.toFixed(1)}%</strong>.
                </span>
            </div>
        </div>
    );
}`;

if (!content.includes(oldDonutFunction)) {
    console.error('oldDonutFunction not found!');
    process.exit(1);
}
content = content.replace(oldDonutFunction, newMatrixFunction);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched StrategyControlTower.tsx with Channel Matrix Redesign!');
