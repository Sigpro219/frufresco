const fs = require('fs');

const filePath = 'C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco/src/components/admin/StrategyControlTower.tsx';
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

// 1. Update fetchData to paginate products and inventory_stocks (>1000 rows) and include origin_source & admin_notes in orders
const oldFetchBlock = `            // Build orders query with date filtering
            let ordersQuery = supabase
                .from('orders')
                .select('id, profile_id, total, status, type, delivery_date, delivery_slot, shipping_address, latitude, longitude, created_at, subtotal, tax, total_weight_kg, sequence_id')
                .neq('status', 'cancelled');

            if (timeRange !== 'all') {
                ordersQuery = ordersQuery.gte('created_at', dateRangeIso.start).lte('created_at', dateRangeIso.end);
            }

            let movementsQuery = supabase
                .from('inventory_movements')
                .select('id, product_id, quantity, type, status_to, notes, created_at')
                .limit(5000);

            if (timeRange !== 'all') {
                movementsQuery = movementsQuery.gte('created_at', dateRangeIso.start).lte('created_at', dateRangeIso.end);
            }

            const [
                ordersRes,
                itemsRes,
                profilesRes,
                stocksRes,
                movementsRes,
                matrixRes,
                quotesRes,
                productsRes,
                leadsRes,
                pricesRes
            ] = await Promise.all([
                ordersQuery,
                supabase
                    .from('order_items')
                    .select('id, order_id, product_id, quantity, unit_price, unit')
                    .limit(10000),
                supabase
                    .from('profiles')
                    .select('id, company_name, contact_name, role, latitude, longitude, address, nit, logistics_data, payment_days, created_at'),
                supabase
                    .from('inventory_stocks')
                    .select('id, product_id, quantity, min_stock_level, status, updated_at'),
                movementsQuery,
                supabase
                    .from('commercial_cost_matrix')
                    .select('product_id, manual_cost, updated_at, is_active')
                    .eq('is_active', true),
                supabase
                    .from('quotes')
                    .select('id, client_id, client_name, status, total_amount, created_at, valid_until'),
                supabase
                    .from('products')
                    .select('id, name, sku, accounting_id, category, inventory_group, unit_of_measure, min_inventory_level, is_active, parent_id'),
                supabase
                    .from('leads')
                    .select('id, company_name, status, created_at'),
                supabase
                    .from('pricing_model_prices')
                    .select('product_id, price')
                    .eq('model_id', GENERAL_INSTITUCIONAL_ID)
            ]);

            setOrders(ordersRes.data || []);
            setOrderItems(itemsRes.data || []);
            setProfiles(profilesRes.data || []);
            setStocks(stocksRes.data || []);
            setMovements(movementsRes.data || []);
            setCostMatrix(matrixRes.data || []);
            setQuotes(quotesRes.data || []);
            setProducts(productsRes.data || []);
            setLeads(leadsRes.data || []);
            setModelPrices(pricesRes.data || []);`;

const newFetchBlock = `            // Build orders query with date filtering (including origin_source and admin_notes for SAC warranty tracking)
            let ordersQuery = supabase
                .from('orders')
                .select('id, profile_id, total, status, type, delivery_date, delivery_slot, shipping_address, latitude, longitude, created_at, subtotal, tax, total_weight_kg, sequence_id, origin_source, admin_notes')
                .neq('status', 'cancelled')
                .limit(5000);

            if (timeRange !== 'all') {
                ordersQuery = ordersQuery.gte('created_at', dateRangeIso.start).lte('created_at', dateRangeIso.end);
            }

            let movementsQuery = supabase
                .from('inventory_movements')
                .select('id, product_id, quantity, type, status_to, notes, created_at')
                .limit(5000);

            if (timeRange !== 'all') {
                movementsQuery = movementsQuery.gte('created_at', dateRangeIso.start).lte('created_at', dateRangeIso.end);
            }

            const [
                ordersRes,
                itemsRes,
                profilesRes,
                stocksRes1,
                stocksRes2,
                movementsRes,
                matrixRes,
                quotesRes,
                productsRes1,
                productsRes2,
                leadsRes,
                pricesRes
            ] = await Promise.all([
                ordersQuery,
                supabase
                    .from('order_items')
                    .select('id, order_id, product_id, quantity, unit_price, unit')
                    .limit(10000),
                supabase
                    .from('profiles')
                    .select('id, company_name, contact_name, role, latitude, longitude, address, nit, logistics_data, payment_days, created_at')
                    .limit(5000),
                supabase
                    .from('inventory_stocks')
                    .select('id, product_id, quantity, min_stock_level, status, updated_at')
                    .range(0, 999),
                supabase
                    .from('inventory_stocks')
                    .select('id, product_id, quantity, min_stock_level, status, updated_at')
                    .range(1000, 2999),
                movementsQuery,
                supabase
                    .from('commercial_cost_matrix')
                    .select('product_id, manual_cost, updated_at, is_active')
                    .eq('is_active', true)
                    .limit(5000),
                supabase
                    .from('quotes')
                    .select('id, client_id, client_name, status, total_amount, created_at, valid_until'),
                supabase
                    .from('products')
                    .select('id, name, sku, accounting_id, category, inventory_group, unit_of_measure, min_inventory_level, is_active, parent_id')
                    .range(0, 999),
                supabase
                    .from('products')
                    .select('id, name, sku, accounting_id, category, inventory_group, unit_of_measure, min_inventory_level, is_active, parent_id')
                    .range(1000, 2999),
                supabase
                    .from('leads')
                    .select('id, company_name, status, created_at'),
                supabase
                    .from('pricing_model_prices')
                    .select('product_id, price')
                    .eq('model_id', GENERAL_INSTITUCIONAL_ID)
                    .limit(5000)
            ]);

            setOrders(ordersRes.data || []);
            setOrderItems(itemsRes.data || []);
            setProfiles(profilesRes.data || []);
            setStocks([...(stocksRes1.data || []), ...(stocksRes2.data || [])]);
            setMovements(movementsRes.data || []);
            setCostMatrix(matrixRes.data || []);
            setQuotes(quotesRes.data || []);
            setProducts([...(productsRes1.data || []), ...(productsRes2.data || [])]);
            setLeads(leadsRes.data || []);
            setModelPrices(pricesRes.data || []);`;

if (!content.includes(oldFetchBlock)) {
    console.error('oldFetchBlock not found!');
    process.exit(1);
}
content = content.replace(oldFetchBlock, newFetchBlock);

// 2. Enhance costMap with parent product fallback
const oldCostMap = `    // Matrix cost lookup
    const costMap = useMemo(() => {
        const m = new Map<string, number>();
        costMatrix.forEach(c => {
            if (c.manual_cost) m.set(c.product_id, Number(c.manual_cost));
        });
        return m;
    }, [costMatrix]);`;

const newCostMap = `    // Matrix cost lookup (with parent fallback for variants)
    const costMap = useMemo(() => {
        const m = new Map<string, number>();
        costMatrix.forEach(c => {
            if (c.manual_cost && Number(c.manual_cost) > 0) m.set(c.product_id, Number(c.manual_cost));
        });
        products.forEach(p => {
            if (!m.has(p.id) && p.parent_id && m.has(p.parent_id)) {
                m.set(p.id, m.get(p.parent_id)!);
            }
        });
        return m;
    }, [costMatrix, products]);`;

if (!content.includes(oldCostMap)) {
    console.error('oldCostMap not found!');
    process.exit(1);
}
content = content.replace(oldCostMap, newCostMap);

// 3. Replace inventoryMetrics with real inventory_group breakdown (Kg & Cost $), real min_inventory_level (no mocked || 10), and real SAC repositions
const oldInventoryMetrics = `    // Metrics calculations for Inventory / Supply Chain Area
    const inventoryMetrics = useMemo(() => {
        let totalStockKg = 0;
        let lowStockCount = 0;
        let totalSkus = products.length;

        const categoryStockMap = new Map<string, { category: string; totalKg: number; skus: number; lowSkus: number }>();

        products.forEach(p => {
            const st = stocks.find(s => s.product_id === p.id);
            const q = Number(st?.quantity) || 0;
            const min = Number(p.min_inventory_level) || 0;
            totalStockKg += q;
            const isLow = q <= min;
            if (isLow) lowStockCount++;

            const cat = p.category || 'General';
            const existing = categoryStockMap.get(cat) || { category: cat, totalKg: 0, skus: 0, lowSkus: 0 };
            categoryStockMap.set(cat, {
                category: cat,
                totalKg: existing.totalKg + q,
                skus: existing.skus + 1,
                lowSkus: existing.lowSkus + (isLow ? 1 : 0)
            });
        });

        let repositionsQty = 0;
        let returnsQty = 0;
        let wasteQty = 0;
        let inboundQty = 0;
        let outboundQty = 0;

        const dailyMovementsMap = new Map<string, { date: string; displayDate: string; inbound: number; outbound: number; waste: number }>();

        movements.forEach(m => {
            const q = Math.abs(Number(m.quantity) || 0);
            const d = new Date(m.created_at);
            const key = d.toISOString().split('T')[0];
            const displayDate = \`\${d.getDate()}/\${d.getMonth() + 1}\`;
            const existing = dailyMovementsMap.get(key) || { date: key, displayDate, inbound: 0, outbound: 0, waste: 0 };

            if (m.type === 'in' || m.type === 'purchase' || m.type === 'entry') {
                inboundQty += q;
                existing.inbound += q;
            } else if (m.type === 'out' || m.type === 'sale' || m.type === 'dispatch' || m.type === 'exit') {
                outboundQty += q;
                existing.outbound += q;
            } else if (m.type === 'waste' || m.type === 'damage' || m.type === 'merma' || m.type === 'adjustment') {
                wasteQty += q;
                existing.waste += q;
            }

            if (m.status_to === 'reposition' || (m.notes && m.notes.toLowerCase().includes('reposicion'))) {
                repositionsQty += q;
            }
            if (m.status_to === 'return' || m.type === 'return' || (m.notes && m.notes.toLowerCase().includes('devolucion'))) {
                returnsQty += q;
            }

            dailyMovementsMap.set(key, existing);
        });

        const dailyMovements = Array.from(dailyMovementsMap.values()).sort((a, b) => a.date.localeCompare(b.date));

        const criticalStocks = products
            .map(p => {
                const st = stocks.find(s => s.product_id === p.id);
                const q = Number(st?.quantity) || 0;
                const min = Number(p.min_inventory_level) || 10;
                const ratio = min > 0 ? (q / min) : 1;
                return {
                    id: p.id,
                    name: p.name,
                    sku: p.sku,
                    category: p.category || 'General',
                    unit: p.unit_of_measure || 'Kg',
                    currentStock: q,
                    minStock: min,
                    ratio,
                    status: q === 0 ? 'AGOTADO' : q <= min ? 'CRÍTICO' : 'ÓPTIMO'
                };
            })
            .sort((a, b) => a.ratio - b.ratio)
            .slice(0, 8);

        const dailyRunRateKg = commercialMetrics.totalKg > 0 ? (commercialMetrics.totalKg / 90) : 1;
        const coverageDays = dailyRunRateKg > 0 ? (totalStockKg / dailyRunRateKg).toFixed(1) : '15.0';

        const categoryBreakdown = Array.from(categoryStockMap.values()).sort((a, b) => b.totalKg - a.totalKg);

        return {
            totalStockKg,
            totalSkus,
            lowStockCount,
            coverageDays,
            repositionsQty,
            returnsQty,
            wasteQty,
            inboundQty,
            outboundQty,
            wasteRatePct: commercialMetrics.totalKg > 0 ? ((wasteQty / commercialMetrics.totalKg) * 100).toFixed(1) : '1.2',
            dailyMovements,
            criticalStocks,
            categoryBreakdown
        };
    }, [products, stocks, movements, commercialMetrics]);`;

const newInventoryMetrics = `    // Metrics calculations for Inventory / Supply Chain Area (connected to real inventory_group, costMap, real min_inventory_level & SAC warranty orders)
    const inventoryMetrics = useMemo(() => {
        let totalStockKg = 0;
        let totalStockCostValue = 0;
        let lowStockCount = 0;
        let configuredMinSkusCount = 0;
        let totalSkus = products.length;

        const stockByProductMap = new Map<string, number>();
        stocks.forEach(s => {
            const q = Number(s.quantity) || 0;
            stockByProductMap.set(s.product_id, (stockByProductMap.get(s.product_id) || 0) + q);
        });

        const groupStockMap = new Map<string, {
            group: string;
            totalKg: number;
            totalCostValue: number;
            skus: number;
            activeStockSkus: number;
            lowSkus: number;
        }>();

        products.forEach(p => {
            const q = stockByProductMap.get(p.id) || 0;
            const unitCost = costMap.get(p.id) || 0;
            const stockCostValue = q * unitCost;
            const min = Number(p.min_inventory_level) || 0;

            totalStockKg += q;
            totalStockCostValue += stockCostValue;

            const hasMin = min > 0;
            if (hasMin) configuredMinSkusCount++;
            const isLow = hasMin && q <= min;
            if (isLow) lowStockCount++;

            const grp = (p.inventory_group || '').trim();
            if (!grp) return;
            const existing = groupStockMap.get(grp) || {
                group: grp,
                totalKg: 0,
                totalCostValue: 0,
                skus: 0,
                activeStockSkus: 0,
                lowSkus: 0
            };
            groupStockMap.set(grp, {
                group: grp,
                totalKg: existing.totalKg + q,
                totalCostValue: existing.totalCostValue + stockCostValue,
                skus: existing.skus + 1,
                activeStockSkus: existing.activeStockSkus + (q > 0 ? 1 : 0),
                lowSkus: existing.lowSkus + (isLow ? 1 : 0)
            });
        });

        let repositionsQty = 0;
        let repositionsOrdersCount = 0;
        let returnsQty = 0;
        let wasteQty = 0;
        let inboundQty = 0;
        let outboundQty = 0;

        // Conectar reposiciones reales de garantía autorizadas por SAC ($0 COP / origin_source = 'customer_service')
        orders.forEach(o => {
            const notesUpper = (o.admin_notes || '').toUpperCase();
            const isSacReposition =
                o.origin_source === 'customer_service' ||
                (Number(o.total || 0) === 0 && (notesUpper.includes('[REPOSICIÓN DE GARANTÍA') || notesUpper.includes('[REPOSICION DE GARANTIA')));
            if (isSacReposition) {
                repositionsOrdersCount += 1;
                repositionsQty += Number(o.total_weight_kg) || 0;
            }
        });

        const dailyMovementsMap = new Map<string, { date: string; displayDate: string; inbound: number; outbound: number; waste: number }>();

        movements.forEach(m => {
            const q = Math.abs(Number(m.quantity) || 0);
            const notesStr = (m.notes || '').toLowerCase();
            // Filtrar registros de simulación o outliers de prueba corruptos (>50.000 Kg en una sola línea)
            if (notesStr.includes('[simulación]') || notesStr.includes('[simulacion]') || q > 50000) {
                return;
            }

            const d = new Date(m.created_at);
            const key = d.toISOString().split('T')[0];
            const displayDate = \`\${d.getDate()}/\${d.getMonth() + 1}\`;
            const existing = dailyMovementsMap.get(key) || { date: key, displayDate, inbound: 0, outbound: 0, waste: 0 };

            if (m.type === 'in' || m.type === 'purchase' || m.type === 'entry') {
                inboundQty += q;
                existing.inbound += q;
            } else if (m.type === 'out' || m.type === 'sale' || m.type === 'dispatch' || m.type === 'exit') {
                outboundQty += q;
                existing.outbound += q;
            } else if (m.type === 'waste' || m.type === 'damage' || m.type === 'merma' || m.type === 'adjustment') {
                wasteQty += q;
                existing.waste += q;
            }

            if (m.status_to === 'reposition' || notesStr.includes('reposicion') || notesStr.includes('reposición')) {
                repositionsQty += q;
            }
            if (m.status_to === 'return' || m.type === 'return' || notesStr.includes('devolucion') || notesStr.includes('devolución')) {
                returnsQty += q;
            }

            dailyMovementsMap.set(key, existing);
        });

        const dailyMovements = Array.from(dailyMovementsMap.values()).sort((a, b) => a.date.localeCompare(b.date));

        // Alerta temprana conectada exclusivamente a productos con min_inventory_level > 0 real en catálogo (cero mocks)
        const criticalStocks = products
            .filter(p => Number(p.min_inventory_level) > 0)
            .map(p => {
                const q = stockByProductMap.get(p.id) || 0;
                const min = Number(p.min_inventory_level);
                const ratio = min > 0 ? (q / min) : 1;
                const deficit = Math.max(min - q, 0);
                return {
                    id: p.id,
                    name: p.name,
                    accountingId: p.accounting_id || null,
                    inventoryGroup: p.inventory_group || 'General',
                    unit: p.unit_of_measure || 'Kg',
                    currentStock: q,
                    minStock: min,
                    deficit,
                    ratio,
                    status: q === 0 ? 'AGOTADO' : q <= min ? 'BAJO MÍNIMO' : 'CUBIERTO'
                };
            })
            .sort((a, b) => a.ratio - b.ratio);

        const dailyRunRateKg = commercialMetrics.totalKg > 0 ? (commercialMetrics.totalKg / 90) : 1;
        const coverageDays = dailyRunRateKg > 0 ? (totalStockKg / dailyRunRateKg).toFixed(1) : '15.0';

        const groupBreakdown = Array.from(groupStockMap.values()).sort((a, b) => b.totalKg - a.totalKg);

        return {
            totalStockKg,
            totalStockCostValue,
            totalSkus,
            configuredMinSkusCount,
            lowStockCount,
            coverageDays,
            repositionsQty,
            repositionsOrdersCount,
            returnsQty,
            wasteQty,
            inboundQty,
            outboundQty,
            wasteRatePct: commercialMetrics.totalKg > 0 ? ((wasteQty / commercialMetrics.totalKg) * 100).toFixed(1) : '0.0',
            dailyMovements,
            criticalStocks,
            groupBreakdown
        };
    }, [products, stocks, movements, orders, costMap, commercialMetrics]);`;

if (!content.includes(oldInventoryMetrics)) {
    console.error('oldInventoryMetrics not found!');
    process.exit(1);
}
content = content.replace(oldInventoryMetrics, newInventoryMetrics);

// 4. Update funnelStages colors to official FruFresco Design Manual tokens
const oldFunnelStages = `        const funnelStages = [
            { name: '1. Leads / Prospectos Registrados', count: leadsCount, pct: 100, color: '#2563EB', icon: <Users size={16} /> },
            { name: '2. Cotizaciones Presentadas', count: quotesCount, pct: leadsCount > 0 ? Math.round((quotesCount / leadsCount) * 100) : 75, color: '#0284C7', icon: <Clock size={16} /> },
            { name: '3. Acuerdos B2B Formalizados', count: agreementsCount, pct: quotesCount > 0 ? Math.round((agreementsCount / quotesCount) * 100) : 40, color: '#0D7A57', icon: <Award size={16} /> },
            { name: '4. Clientes Facturados Recurrentes', count: buyersCount, pct: agreementsCount > 0 ? Math.min(Math.round((buyersCount / agreementsCount) * 100), 100) : 85, color: '#15803D', icon: <CheckCircle2 size={16} /> }
        ];`;

const newFunnelStages = `        const funnelStages = [
            { name: '1. Leads / Prospectos Registrados', count: leadsCount, pct: 100, color: '#475569', icon: <Users size={16} /> },
            { name: '2. Cotizaciones Presentadas', count: quotesCount, pct: leadsCount > 0 ? Math.round((quotesCount / leadsCount) * 100) : 75, color: '#334155', icon: <Clock size={16} /> },
            { name: '3. Acuerdos B2B Formalizados', count: agreementsCount, pct: quotesCount > 0 ? Math.round((agreementsCount / quotesCount) * 100) : 40, color: '#0D7A57', icon: <Award size={16} /> },
            { name: '4. Clientes Facturados Recurrentes', count: buyersCount, pct: agreementsCount > 0 ? Math.min(Math.round((buyersCount / agreementsCount) * 100), 100) : 85, color: '#065F46', icon: <CheckCircle2 size={16} /> }
        ];`;

if (!content.includes(oldFunnelStages)) {
    console.error('oldFunnelStages not found!');
    process.exit(1);
}
content = content.replace(oldFunnelStages, newFunnelStages);

// 5. Update procurementMetrics to use inventory_group instead of category
const oldProcMap = `                    id: p.id,
                    name: p.name,
                    sku: p.sku,
                    category: p.category || 'General',`;

const newProcMap = `                    id: p.id,
                    name: p.name,
                    sku: p.sku,
                    category: p.inventory_group || 'General',`;

if (content.includes(oldProcMap)) {
    content = content.replace(oldProcMap, newProcMap);
}

// 6. Update Excel export for inventory to use Grupo de Inventario & Valor en Costo
const oldExcelInv = `            } else if (areaKey === 'inventory') {
                const stockByProdMap = new Map(stocks.map(s => [s.product_id, s]));
                const invData = products.map(p => {
                    const st = stockByProdMap.get(p.id);
                    return {
                        'ID Contable': p.accounting_id || '—',
                        'Producto': p.name,
                        'SKU': p.sku,
                        'Categoría': p.category,
                        'Unidad': p.unit_of_measure,
                        'Stock Actual (Kg/Und)': Number(st?.quantity || 0),
                        'Stock Mínimo': Number(p.min_inventory_level || 0),
                        'Estado Alerta': (st?.quantity || 0) <= (p.min_inventory_level || 0) ? 'BAJO_STOCK' : 'OK'
                    };
                });
                const ws = XLSX.utils.json_to_sheet(invData);
                XLSX.utils.book_append_sheet(wb, ws, 'Inventarios_Saldos');`;

const newExcelInv = `            } else if (areaKey === 'inventory') {
                const stockByProdMap = new Map<string, number>();
                stocks.forEach(s => {
                    stockByProdMap.set(s.product_id, (stockByProdMap.get(s.product_id) || 0) + Number(s.quantity || 0));
                });
                const invData = products.map(p => {
                    const qty = stockByProdMap.get(p.id) || 0;
                    const min = Number(p.min_inventory_level || 0);
                    const unitCost = costMap.get(p.id) || 0;
                    return {
                        'ID Contable': p.accounting_id || '—',
                        'Producto': p.name,
                        'Grupo de Inventario': p.inventory_group || '—',
                        'Unidad': p.unit_of_measure,
                        'Stock Actual': qty,
                        'Costo Unitario ($)': unitCost,
                        'Valor en Costo ($)': Math.round(qty * unitCost),
                        'Stock Mínimo': min,
                        'Estado Alerta': min > 0 && qty <= min ? 'BAJO_MÍNIMO' : 'OK'
                    };
                });
                const ws = XLSX.utils.json_to_sheet(invData);
                XLSX.utils.book_append_sheet(wb, ws, 'Inventarios_Saldos');`;

if (content.includes(oldExcelInv)) {
    content = content.replace(oldExcelInv, newExcelInv);
}

// 7. Replace Area 2 (activeArea === 'inventory') JSX with strict FruFresco Design Manual tokens, Grupo de Inventario (Kg + Cost $), and clean Early Alert without SKUs
const oldInventoryAreaJsx = `            {/* ── ÁREA 2: INVENTARIOS & CADENA DE SUMINISTRO (BI LOGÍSTICO) ── */}
            {activeArea === 'inventory' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                        <AreaKPICard
                            title="Stock en Bodega"
                            value={\`\${formatNumber(inventoryMetrics.totalStockKg, 1)} Kg\`}
                            subtitle={\`Cobertura promedio: ~\${inventoryMetrics.coverageDays} días\`}
                            icon={<Package size={20} color="#2563EB" />}
                            badgeText="Existencias"
                            badgeBg="#EFF6FF"
                            badgeColor="#1E40AF"
                        />
                        <AreaKPICard
                            title="Tasa de Merma / Ajuste"
                            value={\`\${inventoryMetrics.wasteRatePct}%\`}
                            subtitle={\`\${formatNumber(inventoryMetrics.wasteQty, 1)} Kg registrados en merma\`}
                            icon={<TrendingDown size={20} color={Number(inventoryMetrics.wasteRatePct) > 2 ? '#DC2626' : '#059669'} />}
                            badgeText="Meta: <2.0%"
                            badgeBg="#FEE2E2"
                            badgeColor="#991B1B"
                        />
                        <AreaKPICard
                            title="Reposiciones & Garantías"
                            value={\`\${formatNumber(inventoryMetrics.repositionsQty, 1)} Kg\`}
                            subtitle={\`\${formatNumber(inventoryMetrics.returnsQty, 1)} Kg retornos reingresados\`}
                            icon={<Scale size={20} color="#D97706" />}
                            badgeText="Calidad"
                            badgeBg="#FEF3C7"
                            badgeColor="#B45309"
                        />
                        <AreaKPICard
                            title="SKUs en Alerta Mínima"
                            value={inventoryMetrics.lowStockCount}
                            subtitle={\`De \${inventoryMetrics.totalSkus} productos en catálogo activo\`}
                            icon={<AlertCircle size={20} color="#EA580C" />}
                            badgeText="Escasez"
                            badgeBg="#FFEDD5"
                            badgeColor="#C2410C"
                        />
                    </div>

                    {/* ── BI SECTION 1: HISTÓRICO DE FLUJO DE KARDEX (ENTRADAS VS SALIDAS VS MERMAS) ── */}
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        padding: '1.25rem 1.5rem',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Layers size={18} color="#2563EB" />
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '850', color: '#0F172A' }}>
                                        Flujo de Movimientos en Bodega (Entradas vs. Salidas vs. Mermas)
                                    </h3>
                                </div>
                                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                    Balance volumétrico diario de abastecimiento recibido vs. despachos ejecutados.
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.72rem', fontWeight: '700' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: '#10B981' }} />
                                    <span>Entradas ({formatNumber(inventoryMetrics.inboundQty, 0)} Kg)</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: '#2563EB' }} />
                                    <span>Salidas ({formatNumber(inventoryMetrics.outboundQty, 0)} Kg)</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: '#EF4444' }} />
                                    <span>Mermas ({formatNumber(inventoryMetrics.wasteQty, 0)} Kg)</span>
                                </div>
                            </div>
                        </div>

                        <BIMovementFlowChart movements={inventoryMetrics.dailyMovements} />
                    </div>

                    {/* ── BI SECTION 2: DISTRIBUCIÓN POR CATEGORÍAS & SEMÁFORO DE ESCASEZ ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.25rem' }}>
                        {/* Distribución de Stock por Categoría */}
                        <div style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '16px',
                            border: '1px solid #E2E8F0',
                            padding: '1.25rem 1.5rem',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                        }}>
                            <h3 style={{ margin: '0 0 0.4rem 0', fontSize: '0.98rem', fontWeight: '850', color: '#0F172A' }}>
                                Distribución de Inventario por Categoría
                            </h3>
                            <p style={{ margin: '0 0 1rem 0', fontSize: '0.76rem', color: '#64748B' }}>
                                Kilaje total disponible en bodega desglosado por familias agrícolas.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {inventoryMetrics.categoryBreakdown.slice(0, 6).map((c, i) => {
                                    const pct = inventoryMetrics.totalStockKg > 0 ? ((c.totalKg / inventoryMetrics.totalStockKg) * 100).toFixed(0) : '0';
                                    return (
                                        <div key={i}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: '700', marginBottom: '3px' }}>
                                                <span style={{ color: '#1E293B' }}>{c.category}</span>
                                                <span style={{ color: '#64748B' }}>{formatNumber(c.totalKg, 0)} Kg ({pct}%)</span>
                                            </div>
                                            <div style={{ height: '7px', width: '100%', backgroundColor: '#F1F5F9', borderRadius: '999px', overflow: 'hidden' }}>
                                                <div style={{
                                                    height: '100%',
                                                    width: \`\${pct}%\`,
                                                    backgroundColor: i === 0 ? '#10B981' : i === 1 ? '#2563EB' : i === 2 ? '#D97706' : '#64748B',
                                                    borderRadius: '999px'
                                                }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Semáforo de Escasez & Stock Mínimo */}
                        <div style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '16px',
                            border: '1px solid #E2E8F0',
                            padding: '1.25rem 1.5rem',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '850', color: '#0F172A' }}>
                                    Alerta Temprana de Abastecimiento &amp; Escasez
                                </h3>
                                <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#DC2626', backgroundColor: '#FEE2E2', padding: '2px 7px', borderRadius: '6px' }}>
                                    Buffer de Seguridad
                                </span>
                            </div>
                            <p style={{ margin: '0 0 1rem 0', fontSize: '0.76rem', color: '#64748B' }}>
                                Productos con stock físico cercano o por debajo del umbral mínimo de seguridad.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                {inventoryMetrics.criticalStocks.map((p, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #F1F5F9' }}>
                                        <div>
                                            <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#0F172A' }}>{p.name}</div>
                                            <div style={{ fontSize: '0.68rem', color: '#64748B' }}>SKU: {p.sku} • {p.category}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.78rem', fontWeight: '900', color: p.currentStock === 0 ? '#DC2626' : p.currentStock <= p.minStock ? '#D97706' : '#15803D' }}>
                                                {formatNumber(p.currentStock, 1)} {p.unit}
                                            </div>
                                            <div style={{ fontSize: '0.65rem', color: '#94A3B8' }}>Mín: {p.minStock} {p.unit}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <DownloadCallout
                        areaTitle="Área de Inventario & Cadena de Suministro"
                        description="Descargue el reporte de existencias en bodega: saldos físicos, stock mínimo de seguridad, historial de reposiciones, devoluciones tipificadas y mermas."
                        onDownload={() => handleExportExcel('inventory')}
                        exporting={exporting}
                    />
                </div>
            )}`;

const newInventoryAreaJsx = `            {/* ── ÁREA 2: INVENTARIOS & CADENA DE SUMINISTRO (BI LOGÍSTICO — ESTÁNDAR MANUAL DE DISEÑO FRUFRESCO) ── */}
            {activeArea === 'inventory' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                        <AreaKPICard
                            title="Stock en Bodega"
                            value={\`\${formatNumber(inventoryMetrics.totalStockKg, 1)} Kg\`}
                            subtitle={\`Valor Costo: \${formatMoney(inventoryMetrics.totalStockCostValue)} • ~\${inventoryMetrics.coverageDays}d\`}
                            icon={<Package size={20} color="#0D7A57" />}
                            badgeText="Existencias"
                            badgeBg="#ECFDF5"
                            badgeColor="#065F46"
                        />
                        <AreaKPICard
                            title="Tasa de Merma / Ajuste"
                            value={\`\${inventoryMetrics.wasteRatePct}%\`}
                            subtitle={\`\${formatNumber(inventoryMetrics.wasteQty, 1)} Kg registrados en merma\`}
                            icon={<TrendingDown size={20} color={Number(inventoryMetrics.wasteRatePct) > 2 ? '#DC2626' : '#065F46'} />}
                            badgeText="Meta: <2.0%"
                            badgeBg={Number(inventoryMetrics.wasteRatePct) > 2 ? '#FEF2F2' : '#ECFDF5'}
                            badgeColor={Number(inventoryMetrics.wasteRatePct) > 2 ? '#DC2626' : '#065F46'}
                        />
                        <AreaKPICard
                            title="Reposiciones & Garantías"
                            value={\`\${formatNumber(inventoryMetrics.repositionsQty, 1)} Kg\`}
                            subtitle={\`\${inventoryMetrics.repositionsOrdersCount} garantías SAC ($0) • \${formatNumber(inventoryMetrics.returnsQty, 1)} Kg retornos\`}
                            icon={<ShieldCheck size={20} color="#047857" />}
                            badgeText="Garantía SAC"
                            badgeBg="#ECFDF5"
                            badgeColor="#047857"
                        />
                        <AreaKPICard
                            title="Alertas de Stock Mínimo"
                            value={\`\${inventoryMetrics.lowStockCount} / \${inventoryMetrics.configuredMinSkusCount}\`}
                            subtitle={\`Productos bajo umbral mínimo real configurado\`}
                            icon={<AlertCircle size={20} color="#92400E" />}
                            badgeText="Umbral Real"
                            badgeBg="#FFFBEB"
                            badgeColor="#92400E"
                        />
                    </div>

                    {/* ── BI SECTION 1: HISTÓRICO DE FLUJO DE KARDEX (ENTRADAS VS SALIDAS VS MERMAS) ── */}
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        padding: '1.25rem 1.5rem',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Layers size={18} color="#0D7A57" />
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '850', color: '#0F172A' }}>
                                        Flujo de Movimientos en Bodega (Entradas vs. Salidas vs. Mermas)
                                    </h3>
                                </div>
                                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                    Balance volumétrico diario de abastecimiento recibido vs. despachos ejecutados en planta.
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.72rem', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0F172A' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: '#0D7A57' }} />
                                    <span>Entradas ({formatNumber(inventoryMetrics.inboundQty, 0)} Kg)</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#334155' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: '#475569' }} />
                                    <span>Salidas ({formatNumber(inventoryMetrics.outboundQty, 0)} Kg)</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#991B1B' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: '#DC2626' }} />
                                    <span>Mermas ({formatNumber(inventoryMetrics.wasteQty, 0)} Kg)</span>
                                </div>
                            </div>
                        </div>

                        <BIMovementFlowChart movements={inventoryMetrics.dailyMovements} />
                    </div>

                    {/* ── BI SECTION 2: DISTRIBUCIÓN POR GRUPO DE INVENTARIO (KG & COSTO $) & ALERTA TEMPRANA CONECTADA ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.25rem' }}>
                        {/* Distribución por Grupo de Inventario (Kilos & Valor en Costo) */}
                        <div style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '16px',
                            border: '1px solid #E2E8F0',
                            padding: '1.25rem 1.5rem',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '850', color: '#0F172A' }}>
                                        Distribución por Grupo de Inventario
                                    </h3>
                                    <span style={{
                                        fontSize: '0.68rem',
                                        fontWeight: '800',
                                        color: '#065F46',
                                        backgroundColor: '#ECFDF5',
                                        border: '1px solid #BBF7D0',
                                        padding: '2px 8px',
                                        borderRadius: '6px'
                                    }}>
                                        Kilos &amp; Valor en Costo
                                    </span>
                                </div>
                                <p style={{ margin: '0 0 1rem 0', fontSize: '0.76rem', color: '#64748B' }}>
                                    Kilaje disponible en bodega y valorización a costo por lista de inventario ({formatMoney(inventoryMetrics.totalStockCostValue)} total).
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                    {inventoryMetrics.groupBreakdown.map((g, i) => {
                                        const pctNum = inventoryMetrics.totalStockKg > 0 ? (g.totalKg / inventoryMetrics.totalStockKg) * 100 : 0;
                                        const pct = pctNum.toFixed(1);
                                        const costPct = inventoryMetrics.totalStockCostValue > 0
                                            ? ((g.totalCostValue / inventoryMetrics.totalStockCostValue) * 100).toFixed(1)
                                            : '0.0';
                                        return (
                                            <div key={i} style={{
                                                padding: '0.65rem 0.85rem',
                                                backgroundColor: '#F8FAFC',
                                                borderRadius: '10px',
                                                border: '1px solid #E2E8F0'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '4px' }}>
                                                    <div>
                                                        <div style={{ fontSize: '0.76rem', fontWeight: '800', color: '#0F172A', lineHeight: 1.25 }}>
                                                            {g.group}
                                                        </div>
                                                        <div style={{ fontSize: '0.66rem', fontWeight: '600', color: '#64748B', marginTop: '2px' }}>
                                                            {g.activeStockSkus} productos con saldo físico (de {g.skus} en lista)
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                                                        <div style={{ fontSize: '0.8rem', fontWeight: '900', color: '#0F172A' }}>
                                                            {formatNumber(g.totalKg, 1)} Kg <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#64748B' }}>({pct}%)</span>
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#0D7A57', marginTop: '1px' }}>
                                                            Costo: {formatMoney(g.totalCostValue)} <span style={{ fontSize: '0.64rem', color: '#64748B', fontWeight: '600' }}>({costPct}%)</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ height: '6px', width: '100%', backgroundColor: '#E2E8F0', borderRadius: '999px', overflow: 'hidden', marginTop: '4px' }}>
                                                    <div style={{
                                                        height: '100%',
                                                        width: \`\${Math.max(pctNum, g.totalKg > 0 ? 2 : 0)}%\`,
                                                        backgroundColor: i === 0 ? '#0D7A57' : i === 1 ? '#0A5F43' : i === 2 ? '#047857' : '#475569',
                                                        borderRadius: '999px',
                                                        transition: 'width 0.4s ease'
                                                    }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Alerta Temprana de Abastecimiento & Escasez (Conectada a Mínimos Reales Configurados) */}
                        <div style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '16px',
                            border: '1px solid #E2E8F0',
                            padding: '1.25rem 1.5rem',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '850', color: '#0F172A' }}>
                                        Alerta Temprana de Abastecimiento &amp; Escasez
                                    </h3>
                                    <span style={{
                                        fontSize: '0.68rem',
                                        fontWeight: '800',
                                        color: '#92400E',
                                        backgroundColor: '#FFFBEB',
                                        border: '1px solid #FDE68A',
                                        padding: '2px 8px',
                                        borderRadius: '6px'
                                    }}>
                                        Mínimos Reales ({inventoryMetrics.configuredMinSkusCount})
                                    </span>
                                </div>
                                <p style={{ margin: '0 0 1rem 0', fontSize: '0.76rem', color: '#64748B' }}>
                                    Monitoreo en vivo de productos con umbral mínimo de seguridad configurado en el catálogo maestro.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                                    {inventoryMetrics.criticalStocks.map((p, idx) => {
                                        const isOut = p.currentStock === 0;
                                        const isLow = p.currentStock <= p.minStock;
                                        return (
                                            <div key={idx} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '0.55rem 0.85rem',
                                                backgroundColor: isOut ? '#FEF2F2' : (isLow ? '#FFFBEB' : '#ECFDF5'),
                                                borderRadius: '8px',
                                                border: \`1px solid \${isOut ? '#FECACA' : (isLow ? '#FDE68A' : '#BBF7D0')}\`
                                            }}>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#0F172A' }}>{p.name}</span>
                                                        {p.accountingId && (
                                                            <span style={{
                                                                fontSize: '0.64rem',
                                                                fontWeight: '700',
                                                                color: '#475569',
                                                                backgroundColor: '#FFFFFF',
                                                                border: '1px solid #E2E8F0',
                                                                padding: '1px 5px',
                                                                borderRadius: '4px',
                                                                fontVariantNumeric: 'tabular-nums'
                                                            }}>
                                                                Cód: {p.accountingId}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.66rem', fontWeight: '600', color: '#64748B', marginTop: '2px' }}>
                                                        {p.inventoryGroup}
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                                                        <span style={{
                                                            fontSize: '0.62rem',
                                                            fontWeight: '800',
                                                            padding: '1px 6px',
                                                            borderRadius: '4px',
                                                            backgroundColor: isOut ? '#FEE2E2' : (isLow ? '#FEF3C7' : '#DCFCE7'),
                                                            color: isOut ? '#DC2626' : (isLow ? '#92400E' : '#065F46')
                                                        }}>
                                                            {p.status}
                                                        </span>
                                                        <span style={{
                                                            fontSize: '0.8rem',
                                                            fontWeight: '900',
                                                            color: isOut ? '#DC2626' : (isLow ? '#92400E' : '#065F46')
                                                        }}>
                                                            {formatNumber(p.currentStock, 1)} {p.unit}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.65rem', fontWeight: '700', color: '#64748B', marginTop: '1px' }}>
                                                        Mínimo real: {formatNumber(p.minStock, 0)} {p.unit}
                                                        {p.deficit > 0 ? \` (Faltan \${formatNumber(p.deficit, 1)} \${p.unit})\` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    <DownloadCallout
                        areaTitle="Área de Inventario & Cadena de Suministro"
                        description="Descargue el reporte de existencias en bodega valorizado a costo por Grupo de Inventario, umbrales mínimos reales, reposiciones SAC y mermas."
                        onDownload={() => handleExportExcel('inventory')}
                        exporting={exporting}
                    />
                </div>
            )}`;

if (!content.includes(oldInventoryAreaJsx)) {
    console.error('oldInventoryAreaJsx not found!');
    process.exit(1);
}
content = content.replace(oldInventoryAreaJsx, newInventoryAreaJsx);

// 8. Update BIMovementFlowChart bar colors to FruFresco Design Manual tokens (#0D7A57, #475569, #DC2626)
const oldFlowChart = `                            {/* Inbound Bar */}
                            <div
                                title={\`Entradas: \${formatNumber(m.inbound, 1)} Kg\`}
                                style={{ width: '10px', height: \`\${inHeight}px\`, backgroundColor: '#10B981', borderRadius: '3px 3px 0 0' }}
                            />
                            {/* Outbound Bar */}
                            <div
                                title={\`Salidas: \${formatNumber(m.outbound, 1)} Kg\`}
                                style={{ width: '10px', height: \`\${outHeight}px\`, backgroundColor: '#2563EB', borderRadius: '3px 3px 0 0' }}
                            />
                            {/* Waste Bar */}
                            <div
                                title={\`Mermas: \${formatNumber(m.waste, 1)} Kg\`}
                                style={{ width: '6px', height: \`\${wasteHeight}px\`, backgroundColor: '#EF4444', borderRadius: '2px 2px 0 0' }}
                            />`;

const newFlowChart = `                            {/* Inbound Bar */}
                            <div
                                title={\`Entradas: \${formatNumber(m.inbound, 1)} Kg\`}
                                style={{ width: '10px', height: \`\${inHeight}px\`, backgroundColor: '#0D7A57', borderRadius: '3px 3px 0 0' }}
                            />
                            {/* Outbound Bar */}
                            <div
                                title={\`Salidas: \${formatNumber(m.outbound, 1)} Kg\`}
                                style={{ width: '10px', height: \`\${outHeight}px\`, backgroundColor: '#475569', borderRadius: '3px 3px 0 0' }}
                            />
                            {/* Waste Bar */}
                            <div
                                title={\`Mermas: \${formatNumber(m.waste, 1)} Kg\`}
                                style={{ width: '6px', height: \`\${wasteHeight}px\`, backgroundColor: '#DC2626', borderRadius: '2px 2px 0 0' }}
                            />`;

if (!content.includes(oldFlowChart)) {
    console.error('oldFlowChart not found!');
    process.exit(1);
}
content = content.replace(oldFlowChart, newFlowChart);

// 9. Update Area 4 table header from Categoría to Grupo de Inventario
content = content.replace(
    `<th style={{ padding: '0.6rem 0.5rem', fontWeight: '800' }}>Categoría</th>`,
    `<th style={{ padding: '0.6rem 0.5rem', fontWeight: '800' }}>Grupo de Inventario</th>`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched StrategyControlTower.tsx with Inventory Groups, Real Min Stock, No SKUs & FruFresco Design Manual!');
