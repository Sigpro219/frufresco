const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/CommercialUnifiedDashboard.tsx');
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

// 1. Declare ChannelPerformanceItem interface
const interfaceDeclaration = `interface ChannelPerformanceItem {
    id: 'special_chains' | 'b2b_standard' | 'b2c_home';
    name: string;
    description: string;
    tag: string;
    color: string;
    bgColor: string;
    borderColor: string;
    ordersCount: number;
    totalSales: number;
    totalCost: number;
    grossProfit: number;
    salesSharePct: number;
    profitSharePct: number;
    marginPct: number;
}
`;

if (!content.includes('interface ChannelPerformanceItem')) {
    content = interfaceDeclaration + '\n' + content;
}

// 2. Add channelMixData state
const oldStateAnchor = `    const [costIncreases, setCostIncreases] = useState<CostTrendItem[]>([]);
    const [costDecreases, setCostDecreases] = useState<CostTrendItem[]>([]);`;

const newState = `    const [costIncreases, setCostIncreases] = useState<CostTrendItem[]>([]);
    const [costDecreases, setCostDecreases] = useState<CostTrendItem[]>([]);

    // Mix de Canales (Venta vs Utilidad - SDD v1.9.290)
    const [channelMixData, setChannelMixData] = useState<ChannelPerformanceItem[]>([]);`;

if (content.includes(oldStateAnchor)) {
    content = content.replace(oldStateAnchor, newState);
} else {
    console.error('oldStateAnchor not found!');
    process.exit(1);
}

// 3. In fetchAllData, fetch agreementSettingsRes in Promise.all
const oldPromiseAll = `            // 2. Fetch Active Products Catalog, Matrix Costs, Purchases, Leads, Quotes & Bulletin Audit
            const [productsRes, matrixRes, appSettingsRes, purchasesRes, leadsRes, quotesRes, bulletinAuditRes, unpricedOrdersRes] = await Promise.all([
                supabase
                    .from('products')
                    .select('id, name, sku, accounting_id, category, unit_of_measure, is_active')
                    .eq('is_active', true),
                supabase
                    .from('commercial_cost_matrix')
                    .select('product_id, manual_cost, updated_at, is_active')
                    .eq('is_active', true),
                supabase
                    .from('app_settings')
                    .select('key, value')
                    .eq('key', 'scarcity_locked_skus')
                    .maybeSingle(),`;

const newPromiseAll = `            // 2. Fetch Active Products Catalog, Matrix Costs, Purchases, Leads, Quotes, Bulletin Audit & Special Agreements
            const [productsRes, matrixRes, appSettingsRes, purchasesRes, leadsRes, quotesRes, bulletinAuditRes, unpricedOrdersRes, agreementSettingsRes] = await Promise.all([
                supabase
                    .from('products')
                    .select('id, name, sku, accounting_id, category, unit_of_measure, is_active')
                    .eq('is_active', true),
                supabase
                    .from('commercial_cost_matrix')
                    .select('product_id, manual_cost, updated_at, is_active')
                    .eq('is_active', true),
                supabase
                    .from('app_settings')
                    .select('key, value')
                    .eq('key', 'scarcity_locked_skus')
                    .maybeSingle(),`;

const oldPromiseAllEnd = `                supabase
                    .from('orders')
                    .select('id, sequence_id, created_at, delivery_date, admin_notes, profiles (company_name, contact_name)')
                    .or('admin_notes.ilike.%DESPACHADO SIN PRECIO%,admin_notes.ilike.%SE DESPACHÓ SIN PRECIO%')
                    .neq('status', 'cancelled')
                    .order('created_at', { ascending: false })
                    .limit(10)
            ]);`;

const newPromiseAllEnd = `                supabase
                    .from('orders')
                    .select('id, sequence_id, created_at, delivery_date, admin_notes, profiles (company_name, contact_name)')
                    .or('admin_notes.ilike.%DESPACHADO SIN PRECIO%,admin_notes.ilike.%SE DESPACHÓ SIN PRECIO%')
                    .neq('status', 'cancelled')
                    .order('created_at', { ascending: false })
                    .limit(10),
                supabase
                    .from('app_settings')
                    .select('key, value')
                    .like('key', 'agreement_clients:%')
            ]);`;

if (content.includes(oldPromiseAll) && content.includes(oldPromiseAllEnd)) {
    content = content.replace(oldPromiseAll, newPromiseAll);
    content = content.replace(oldPromiseAllEnd, newPromiseAllEnd);
} else {
    console.error('Promise.all anchors not found!');
    process.exit(1);
}

// 4. In fetchAllData, parse specialClientSet and aggregate channels
const oldClientAggAnchor = `            // Client aggregation map
            const clientAggMap = new Map<string, {
                volume: number;
                amount: number;
                orderCount: number;
            }>();`;

const newClientAggAnchor = `            // Special Agreements clients padrón
            const specialClientSet = new Set<string>();
            (agreementSettingsRes?.data || []).forEach((s: any) => {
                try {
                    const arr = JSON.parse(typeof s.value === 'string' ? s.value : JSON.stringify(s.value));
                    if (Array.isArray(arr)) {
                        arr.forEach((id: string) => specialClientSet.add(id));
                    }
                } catch (e) {}
            });

            // Canal aggregation map (Mix de Venta vs Utilidad)
            const channelAgg = {
                special_chains: {
                    id: 'special_chains' as const,
                    name: 'Cadenas / Acuerdos Especiales',
                    description: 'Nutresa (El Corral, Beer Station, Leños), Colsubsidio y convenios macro',
                    tag: 'Macro Cuentas B2B',
                    color: '#059669',
                    bgColor: '#ECFDF5',
                    borderColor: '#A7F3D0',
                    ordersCount: 0,
                    totalSales: 0,
                    totalCost: 0,
                    grossProfit: 0,
                    salesSharePct: 0,
                    profitSharePct: 0,
                    marginPct: 0
                },
                b2b_standard: {
                    id: 'b2b_standard' as const,
                    name: 'B2B Institucional Estándar',
                    description: 'Restaurantes, hoteles, casinos y pymes independientes',
                    tag: 'HORECA & Pymes',
                    color: '#2563EB',
                    bgColor: '#EFF6FF',
                    borderColor: '#BFDBFE',
                    ordersCount: 0,
                    totalSales: 0,
                    totalCost: 0,
                    grossProfit: 0,
                    salesSharePct: 0,
                    profitSharePct: 0,
                    marginPct: 0
                },
                b2c_home: {
                    id: 'b2c_home' as const,
                    name: 'Hogar / B2C Directo',
                    description: 'Venta directa a personas naturales y consumo domiciliario',
                    tag: 'Consumo Detal',
                    color: '#D97706',
                    bgColor: '#FFFBEB',
                    borderColor: '#FDE68A',
                    ordersCount: 0,
                    totalSales: 0,
                    totalCost: 0,
                    grossProfit: 0,
                    salesSharePct: 0,
                    profitSharePct: 0,
                    marginPct: 0
                }
            };

            // Client aggregation map
            const clientAggMap = new Map<string, {
                volume: number;
                amount: number;
                orderCount: number;
            }>();`;

if (content.includes(oldClientAggAnchor)) {
    content = content.replace(oldClientAggAnchor, newClientAggAnchor);
} else {
    console.error('oldClientAggAnchor not found!');
    process.exit(1);
}

// 5. In currentOrders.forEach, compute channel assignment and cost/profit
const oldOrdersLoopItem = `                totalSales += amt;
                if (isB2B) b2bSales += amt;
                else b2cSales += amt;`;

const newOrdersLoopItem = `                totalSales += amt;
                if (isB2B) b2bSales += amt;
                else b2cSales += amt;

                // Clasificación canónica de canal (Mix Venta vs Utilidad)
                const isSpecial = specialClientSet.has(o.profile_id) || 
                                  (prof?.parent_id && specialClientSet.has(prof.parent_id)) ||
                                  /corral|nutresa|ircc|colsubsidio|leños|beer station/i.test(prof?.company_name || '');
                let chKey: 'special_chains' | 'b2b_standard' | 'b2c_home' = 'b2c_home';
                if (isSpecial) {
                    chKey = 'special_chains';
                } else if (isB2B) {
                    chKey = 'b2b_standard';
                }

                channelAgg[chKey].ordersCount += 1;
                channelAgg[chKey].totalSales += amt;

                const oItems = currentItemsByOrder.get(o.id) || [];
                let oCost = 0;
                oItems.forEach(it => {
                    const qty = Number(it.quantity || 0);
                    const price = Number(it.unit_price || 0);
                    const unitCost = matrixCostMap.get(it.product_id) || latestPurchaseMap.get(it.product_id) || (price > 0 ? price * 0.70 : 0);
                    oCost += qty * unitCost;
                });
                if (oCost === 0 && amt > 0) {
                    oCost = amt * 0.70;
                }
                channelAgg[chKey].totalCost += oCost;
                channelAgg[chKey].grossProfit += (amt - oCost);`;

if (content.includes(oldOrdersLoopItem)) {
    content = content.replace(oldOrdersLoopItem, newOrdersLoopItem);
} else {
    console.error('oldOrdersLoopItem not found!');
    process.exit(1);
}

// 6. After orders loop, finalize channelMixData
const oldSetKpisAnchor = `            setKpis({`;

const newChannelMixFinalize = `            // Finalizar cálculo de participación de canales (Mix Venta vs Utilidad)
            const totalChannelSales = Object.values(channelAgg).reduce((sum, c) => sum + c.totalSales, 0);
            const totalChannelProfit = Object.values(channelAgg).reduce((sum, c) => sum + c.grossProfit, 0);

            const computedChannels: ChannelPerformanceItem[] = Object.values(channelAgg).map(c => {
                const salesSharePct = totalChannelSales > 0 ? (c.totalSales / totalChannelSales) * 100 : 0;
                const profitSharePct = totalChannelProfit > 0 ? (c.grossProfit / totalChannelProfit) * 100 : 0;
                const marginPct = c.totalSales > 0 ? (c.grossProfit / c.totalSales) * 100 : 0;
                return {
                    ...c,
                    salesSharePct: Math.round(salesSharePct * 10) / 10,
                    profitSharePct: Math.round(profitSharePct * 10) / 10,
                    marginPct: Math.round(marginPct * 10) / 10
                };
            });
            setChannelMixData(computedChannels);

            setKpis({`;

if (content.includes(oldSetKpisAnchor)) {
    content = content.replace(oldSetKpisAnchor, newChannelMixFinalize);
} else {
    console.error('oldSetKpisAnchor not found!');
    process.exit(1);
}

// 7. Render UI Panel for Matriz de Participación Mixta por Canal
const oldRenderAnchor = `            </div>

            {/* 2.5 EMBUDO DE CONVERSIÓN COMERCIAL & CENTRO DE ALERTAS ACTIVAS */}`;

const channelMixUiPanel = `            </div>

            {/* 2. MATRIZ DE PARTICIPACIÓN MIXTA POR CANAL: VENTA VS UTILIDAD (SDD v1.9.290) */}
            <div style={{
                backgroundColor: 'white',
                borderRadius: THEME.radius.lg,
                border: \`1px solid \${THEME.colors.border}\`,
                boxShadow: THEME.shadow.sm,
                padding: '1.4rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem'
            }}>
                {/* Cabecera del Panel */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <PieChartIcon size={20} color={THEME.colors.primary} /> Participación Mixta por Canal: Venta vs Utilidad
                        </h2>
                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: THEME.colors.textSecondary }}>
                            Contribución real de ingresos, margen y rentabilidad por segmento operativo de mercado
                        </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: '800', backgroundColor: '#F1F5F9', color: '#475569', padding: '4px 10px', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Layers size={13} /> 3 Canales Analizados
                        </span>
                        <span style={{ fontSize: '0.72rem', fontWeight: '800', backgroundColor: '#ECFDF5', color: '#059669', padding: '4px 10px', borderRadius: '12px', border: '1px solid #A7F3D0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <TrendingUp size={13} /> Margen Promedio: {kpis.weightedMargin}%
                        </span>
                    </div>
                </div>

                {/* Barras de Progreso Duales de Participación (Mix Venta vs Mix Utilidad) */}
                <div style={{
                    backgroundColor: '#F8FAFC',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem'
                }}>
                    {/* Barra 1: Mix de Ventas */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '0.78rem' }}>
                            <span style={{ fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                📊 Mix de Facturación Bruta: <strong>{formatMoney(kpis.totalSales)}</strong>
                            </span>
                            <span style={{ fontSize: '0.72rem', color: THEME.colors.textSecondary }}>
                                Proporción sobre total facturado
                            </span>
                        </div>
                        <div style={{ width: '100%', height: '14px', backgroundColor: '#E2E8F0', borderRadius: '999px', overflow: 'hidden', display: 'flex' }}>
                            {channelMixData.map(c => (
                                c.salesSharePct > 0 ? (
                                    <div
                                        key={c.id + '_sales_bar'}
                                        title={\`\${c.name}: \${c.salesSharePct}% (\${formatMoney(c.totalSales)})\`}
                                        style={{
                                            width: \`\${c.salesSharePct}%\`,
                                            backgroundColor: c.color,
                                            height: '100%',
                                            transition: 'width 0.3s ease'
                                        }}
                                    />
                                ) : null
                            ))}
                        </div>
                    </div>

                    {/* Barra 2: Mix de Utilidad Bruta */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '0.78rem' }}>
                            <span style={{ fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                💰 Mix de Utilidad Bruta (Ganancia Real): <strong>{formatMoney(channelMixData.reduce((s, c) => s + c.grossProfit, 0))}</strong>
                            </span>
                            <span style={{ fontSize: '0.72rem', color: THEME.colors.textSecondary }}>
                                Proporción sobre utilidad acumulada
                            </span>
                        </div>
                        <div style={{ width: '100%', height: '14px', backgroundColor: '#E2E8F0', borderRadius: '999px', overflow: 'hidden', display: 'flex' }}>
                            {channelMixData.map(c => (
                                c.profitSharePct > 0 ? (
                                    <div
                                        key={c.id + '_profit_bar'}
                                        title={\`\${c.name}: \${c.profitSharePct}% (\${formatMoney(c.grossProfit)})\`}
                                        style={{
                                            width: \`\${c.profitSharePct}%\`,
                                            backgroundColor: c.color,
                                            height: '100%',
                                            transition: 'width 0.3s ease'
                                        }}
                                    />
                                ) : null
                            ))}
                        </div>
                    </div>
                </div>

                {/* Tarjetas Comparativas de los 3 Canales */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                    {channelMixData.map(ch => (
                        <div
                            key={ch.id}
                            style={{
                                backgroundColor: 'white',
                                borderRadius: '10px',
                                border: \`1px solid \${ch.borderColor}\`,
                                padding: '1.15rem',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                                position: 'relative',
                                overflow: 'hidden'
                            }}
                        >
                            <div style={{ width: '4px', height: '100%', position: 'absolute', left: 0, top: 0, backgroundColor: ch.color }} />

                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                    <div>
                                        <span style={{
                                            fontSize: '0.68rem',
                                            fontWeight: '800',
                                            backgroundColor: ch.bgColor,
                                            color: ch.color,
                                            padding: '2px 8px',
                                            borderRadius: '6px',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.04em'
                                        }}>
                                            {ch.tag}
                                        </span>
                                        <div style={{ fontWeight: '800', fontSize: '0.98rem', color: THEME.colors.textMain, marginTop: '4px' }}>
                                            {ch.name}
                                        </div>
                                    </div>
                                    <span style={{ fontSize: '0.72rem', fontWeight: '700', color: THEME.colors.textSecondary, backgroundColor: '#F8FAFC', padding: '2px 6px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                                        {ch.ordersCount} pedidos
                                    </span>
                                </div>

                                <p style={{ margin: '0 0 1rem 0', fontSize: '0.74rem', color: THEME.colors.textSecondary, lineHeight: 1.35 }}>
                                    {ch.description}
                                </p>
                            </div>

                            {/* Métricas Duales: Venta vs Utilidad */}
                            <div style={{
                                backgroundColor: '#F8FAFC',
                                borderRadius: '8px',
                                padding: '0.75rem 0.85rem',
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '0.75rem',
                                border: '1px solid #F1F5F9'
                            }}>
                                {/* Columna Venta */}
                                <div>
                                    <div style={{ fontSize: '0.68rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>
                                        Venta Bruta
                                    </div>
                                    <div style={{ fontWeight: '800', fontSize: '0.92rem', color: THEME.colors.textMain, marginTop: '2px' }}>
                                        {formatMoney(ch.totalSales)}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: '800', color: ch.color, marginTop: '2px' }}>
                                        {ch.salesSharePct}% del total
                                    </div>
                                </div>

                                {/* Columna Utilidad */}
                                <div>
                                    <div style={{ fontSize: '0.68rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>
                                        Utilidad Bruta
                                    </div>
                                    <div style={{ fontWeight: '800', fontSize: '0.92rem', color: ch.grossProfit >= 0 ? '#0D7A57' : '#DC2626', marginTop: '2px' }}>
                                        {formatMoney(ch.grossProfit)}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: '800', color: ch.grossProfit >= 0 ? '#0D7A57' : '#DC2626', marginTop: '2px' }}>
                                        {ch.profitSharePct}% del margen
                                    </div>
                                </div>
                            </div>

                            {/* Margen del Canal */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.85rem', paddingTop: '0.65rem', borderTop: '1px solid #F1F5F9', fontSize: '0.75rem' }}>
                                <span style={{ color: THEME.colors.textSecondary, fontWeight: '600' }}>
                                    Margen Ponderado:
                                </span>
                                <span style={{
                                    fontWeight: '900',
                                    fontSize: '0.82rem',
                                    color: ch.marginPct >= 25 ? '#0D7A57' : (ch.marginPct >= 18 ? '#D97706' : '#DC2626'),
                                    backgroundColor: ch.marginPct >= 25 ? '#DCFCE7' : (ch.marginPct >= 18 ? '#FEF3C7' : '#FEE2E2'),
                                    padding: '2px 8px',
                                    borderRadius: '5px'
                                }}>
                                    {ch.marginPct.toFixed(1)}% margen
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 2.5 EMBUDO DE CONVERSIÓN COMERCIAL & CENTRO DE ALERTAS ACTIVAS */}`;

if (content.includes(oldRenderAnchor)) {
    content = content.replace(oldRenderAnchor, channelMixUiPanel);
} else {
    console.error('oldRenderAnchor not found!');
    process.exit(1);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched CommercialUnifiedDashboard.tsx with Channel Mix Matrix!');
