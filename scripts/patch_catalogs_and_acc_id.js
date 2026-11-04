const fs = require('fs');
const path = require('path');

const repoPath = 'C:\\Users\\German Higuera\\OneDrive\\Documentos\\Projects\\frufresco';
const monitorPath = path.join(repoPath, 'src\\components\\CommercialDailyMonitorModule.tsx');
let content = fs.readFileSync(monitorPath, 'utf8').replace(/\r\n/g, '\n');

// 1. Patch loadCatalogs to paginate products, profiles, cost matrix
const oldLoadCatalogs = `        async function loadCatalogs() {
            try {
                const [matrixRes, productsRes, profilesRes] = await Promise.all([
                    supabase.from('commercial_cost_matrix').select('product_id, manual_cost').eq('is_active', true).range(0, 4999),
                    supabase.from('products').select('id, name, sku, category, unit_of_measure, accounting_id').range(0, 4999),
                    supabase.from('profiles').select('id, company_name, contact_name, nit, address, role, document_type, razon_social, branch_id').range(0, 4999)
                ]);

                const cMap = new Map<string, number>();
                (matrixRes.data || []).forEach((m: any) => {
                    if (m.manual_cost && Number(m.manual_cost) > 0) {
                        cMap.set(m.product_id, Number(m.manual_cost));
                    }
                });
                setCostMap(cMap);

                const pMap = new Map<string, any>();
                (productsRes.data || []).forEach((p: any) => pMap.set(p.id, p));
                setProductsMap(pMap);

                const profMap = new Map<string, any>();
                (profilesRes.data || []).forEach((pr: any) => profMap.set(pr.id, pr));
                setProfilesMap(profMap);
            } catch (err) {
                console.error('Error loading catalogs in Daily Monitor:', err);
            }
        }`;

const newLoadCatalogs = `        async function loadCatalogs() {
            try {
                // Función auxiliar para traer TODOS los registros paginando en bloques de 1000 (Supabase max_rows clamp)
                async function fetchAll(table: string, selectCols: string, filter?: { col: string; val: any }) {
                    const allRows: any[] = [];
                    let from = 0;
                    const step = 1000;
                    while (true) {
                        let query = supabase.from(table).select(selectCols).range(from, from + step - 1);
                        if (filter) {
                            query = query.eq(filter.col, filter.val);
                        }
                        const { data, error } = await query;
                        if (error || !data || data.length === 0) break;
                        allRows.push(...data);
                        if (data.length < step) break;
                        from += step;
                    }
                    return allRows;
                }

                const [matrixRows, productsRows, profilesRows] = await Promise.all([
                    fetchAll('commercial_cost_matrix', 'product_id, manual_cost', { col: 'is_active', val: true }),
                    fetchAll('products', 'id, name, sku, category, unit_of_measure, accounting_id'),
                    fetchAll('profiles', 'id, company_name, contact_name, nit, address, role, document_type, razon_social, branch_id')
                ]);

                const cMap = new Map<string, number>();
                matrixRows.forEach((m: any) => {
                    if (m.manual_cost && Number(m.manual_cost) > 0) {
                        cMap.set(m.product_id, Number(m.manual_cost));
                    }
                });
                setCostMap(cMap);

                const pMap = new Map<string, any>();
                productsRows.forEach((p: any) => pMap.set(p.id, p));
                setProductsMap(pMap);

                const profMap = new Map<string, any>();
                profilesRows.forEach((pr: any) => profMap.set(pr.id, pr));
                setProfilesMap(profMap);
            } catch (err) {
                console.error('Error loading catalogs in Daily Monitor:', err);
            }
        }`;

if (!content.includes(oldLoadCatalogs)) {
    console.error('oldLoadCatalogs not found!');
    process.exit(1);
}
content = content.replace(oldLoadCatalogs, newLoadCatalogs);

// 2. Patch processedItems to include accountingId
const oldProcessedItem = `                        id: it.id,
                        orderId: ord.id,
                        productId: it.product_id,
                        productName: prod.name || it.variant_label || 'Producto Agro',
                        sku: prod.sku || 'SKU-00',
                        category: prod.category || 'General',`;

const newProcessedItem = `                        id: it.id,
                        orderId: ord.id,
                        productId: it.product_id,
                        productName: prod.name || it.variant_label || 'Producto Agro',
                        sku: prod.sku || 'SKU-00',
                        accountingId: prod.accounting_id || it.accounting_id || null,
                        category: prod.category || 'General',`;

if (!content.includes(oldProcessedItem)) {
    console.error('oldProcessedItem not found!');
    process.exit(1);
}
content = content.replace(oldProcessedItem, newProcessedItem);

// 3. Patch prodAggMap to store accountingId
const oldProdAggType = `            const prodAggMap = new Map<string, {
                productName: string;
                sku: string;
                category: string;
                unit: string;
                totalQty: number;
                totalSales: number;
                totalCost: number;
                orderIds: Set<string>;
            }>();`;

const newProdAggType = `            const prodAggMap = new Map<string, {
                productName: string;
                sku: string;
                accountingId?: string | number | null;
                category: string;
                unit: string;
                totalQty: number;
                totalSales: number;
                totalCost: number;
                orderIds: Set<string>;
            }>();`;

if (!content.includes(oldProdAggType)) {
    console.error('oldProdAggType not found!');
    process.exit(1);
}
content = content.replace(oldProdAggType, newProdAggType);

const oldProdAggSet = `                    if (!prodAggMap.has(it.productId)) {
                        prodAggMap.set(it.productId, {
                            productName: it.productName,
                            sku: it.sku,
                            category: it.category,
                            unit: it.unit,
                            totalQty: 0,
                            totalSales: 0,
                            totalCost: 0,
                            orderIds: new Set()
                        });
                    }`;

const newProdAggSet = `                    if (!prodAggMap.has(it.productId)) {
                        prodAggMap.set(it.productId, {
                            productName: it.productName,
                            sku: it.sku,
                            accountingId: it.accountingId,
                            category: it.category,
                            unit: it.unit,
                            totalQty: 0,
                            totalSales: 0,
                            totalCost: 0,
                            orderIds: new Set()
                        });
                    }`;

if (!content.includes(oldProdAggSet)) {
    console.error('oldProdAggSet not found!');
    process.exit(1);
}
content = content.replace(oldProdAggSet, newProdAggSet);

const oldConsolidatedReturn = `                return {
                    productId: pId,
                    productName: val.productName,
                    sku: val.sku,
                    category: val.category,
                    unit: val.unit,`;

const newConsolidatedReturn = `                return {
                    productId: pId,
                    productName: val.productName,
                    sku: val.sku,
                    accountingId: val.accountingId,
                    category: val.category,
                    unit: val.unit,`;

if (!content.includes(oldConsolidatedReturn)) {
    console.error('oldConsolidatedReturn not found!');
    process.exit(1);
}
content = content.replace(oldConsolidatedReturn, newConsolidatedReturn);

// 4. Update searchTerm filtering for products to also search by accountingId
const oldProductFilter = `    const filteredProducts = useMemo(() => {
        if (!searchTerm) return productConsolidated;
        const s = searchTerm.toLowerCase();
        return productConsolidated.filter(p =>
            p.productName.toLowerCase().includes(s) ||
            p.sku.toLowerCase().includes(s) ||
            p.category.toLowerCase().includes(s)
        );
    }, [productConsolidated, searchTerm]);`;

const newProductFilter = `    const filteredProducts = useMemo(() => {
        if (!searchTerm) return productConsolidated;
        const s = searchTerm.toLowerCase();
        return productConsolidated.filter(p =>
            p.productName.toLowerCase().includes(s) ||
            p.sku.toLowerCase().includes(s) ||
            (p.accountingId && String(p.accountingId).toLowerCase().includes(s)) ||
            (CATEGORY_MAP[p.category] && CATEGORY_MAP[p.category].toLowerCase().includes(s)) ||
            p.category.toLowerCase().includes(s)
        );
    }, [productConsolidated, searchTerm]);`;

if (content.includes(oldProductFilter)) {
    content = content.replace(oldProductFilter, newProductFilter);
}

fs.writeFileSync(monitorPath, content, 'utf8');
console.log('Successfully patched catalogs pagination and accounting_id in CommercialDailyMonitorModule.tsx!');
