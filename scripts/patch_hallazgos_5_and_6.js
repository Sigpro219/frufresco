const fs = require('fs');
const path = require('path');

const filePath = path.join('C:', 'Users', 'German Higuera', 'OneDrive', 'Documentos', 'Projects', 'frufresco', 'src', 'components', 'CommercialAgreementsModule.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Helper function to fetch real numeric max accounting_id
const targetFunction = `    const handleOpenQuickProductModal = async (rowIdx: number) => {`;

const newFunction = `    const fetchNumericNextAccId = async (): Promise<number> => {
        try {
            const { data } = await supabase
                .from('products')
                .select('accounting_id')
                .not('accounting_id', 'is', null)
                .range(0, 4999);
            let maxId = 0;
            if (data && data.length > 0) {
                data.forEach((p: any) => {
                    const num = parseInt(String(p.accounting_id).trim(), 10);
                    if (!isNaN(num) && num > maxId) {
                        maxId = num;
                    }
                });
            }
            return maxId > 0 ? maxId + 1 : 1701;
        } catch (err) {
            console.warn('Error fetching numeric nextAccId:', err);
            return 1701;
        }
    };

    const handleOpenQuickProductModal = async (rowIdx: number) => {`;

if (!content.includes(targetFunction)) {
    console.error('Target handleOpenQuickProductModal not found');
    process.exit(1);
}
content = content.replace(targetFunction, newFunction);

// Replace accounting_id fetch in handleOpenQuickProductModal
const targetFetchInOpen = `        try {
            const { data: maxIdData } = await supabase
                .from('products')
                .select('accounting_id')
                .not('accounting_id', 'is', null)
                .order('accounting_id', { ascending: false })
                .limit(1);

            const nextAccId = maxIdData && maxIdData[0]?.accounting_id ? Number(maxIdData[0].accounting_id) + 1 : 1701;
            setQuickProductNextAccId(nextAccId);
        } catch (e) {
            console.warn('Error fetching next accounting_id:', e);
            setQuickProductNextAccId(1701);
        } finally {
            setIsLoadingNextAccId(false);
        }`;

const replacementFetchInOpen = `        try {
            const nextAccId = await fetchNumericNextAccId();
            setQuickProductNextAccId(nextAccId);
        } catch (e) {
            console.warn('Error fetching next accounting_id:', e);
            setQuickProductNextAccId(1701);
        } finally {
            setIsLoadingNextAccId(false);
        }`;

if (!content.includes(targetFetchInOpen)) {
    console.error('Target fetch in open not found');
    process.exit(1);
}
content = content.replace(targetFetchInOpen, replacementFetchInOpen);

// Replace handleSaveQuickProduct with robust numeric ID calculation and double-safety target row assignment
const targetSaveLogic = `        setIsCreatingQuickProduct(true);
        try {
            const { data: maxIdData } = await supabase
                .from('products')
                .select('accounting_id')
                .not('accounting_id', 'is', null)
                .order('accounting_id', { ascending: false })
                .limit(1);

            const nextAccId = maxIdData && maxIdData[0]?.accounting_id ? Number(maxIdData[0].accounting_id) + 1 : (quickProductNextAccId || 1701);
            const cleanSku = quickProductCategory + '-' + String(nextAccId).padStart(5, '0');

            const { data: newProd, error: createErr } = await supabase
                .from('products')
                .insert({
                    name: quickProductName.trim(),
                    sku: cleanSku,
                    accounting_id: nextAccId,
                    category: quickProductCategory,
                    unit_of_measure: quickProductUnit || 'Kg',
                    base_price: 0,
                    iva_rate: quickProductIvaRate,
                    is_active: true,
                    show_on_web: true,
                    weight_kg: quickProductUnit.toLowerCase() === 'kg' ? 1 : 0.5,
                    inventory_group: quickProductInventoryGroup || 'INVENTARIO DE VERDURAS',
                    buying_team: quickProductBuyingTeam || 'ALISTAMIENTO VERDURAS',
                    procurement_method: quickProductProcurementMethod || 'COMPRAS MENORES'
                })
                .select()
                .single();

            if (createErr) throw createErr;

            newProd.cost_basis = 0;
            setCatalogProducts(prev => [newProd, ...prev]);

            if (quickProductRowIdx !== null) {
                handleAssignProductToRow(quickProductRowIdx, newProd);
            }

            setIsQuickProductModalOpen(false);
            showToast('Producto "' + newProd.name + '" (ID #' + newProd.accounting_id + ') creado y vinculado exitosamente', 'success');`;

const replacementSaveLogic = `        setIsCreatingQuickProduct(true);
        try {
            const nextAccId = await fetchNumericNextAccId();
            const cleanSku = quickProductCategory + '-' + String(nextAccId).padStart(5, '0');

            const { data: newProd, error: createErr } = await supabase
                .from('products')
                .insert({
                    name: quickProductName.trim(),
                    sku: cleanSku,
                    accounting_id: nextAccId,
                    category: quickProductCategory,
                    unit_of_measure: quickProductUnit || 'Kg',
                    base_price: 0,
                    iva_rate: quickProductIvaRate,
                    is_active: true,
                    show_on_web: true,
                    weight_kg: quickProductUnit.toLowerCase() === 'kg' ? 1 : 0.5,
                    inventory_group: quickProductInventoryGroup || 'INVENTARIO DE VERDURAS',
                    buying_team: quickProductBuyingTeam || 'ALISTAMIENTO VERDURAS',
                    procurement_method: quickProductProcurementMethod || 'COMPRAS MENORES'
                })
                .select()
                .single();

            if (createErr) throw createErr;

            newProd.cost_basis = 0;
            setCatalogProducts(prev => [newProd, ...prev]);

            // Asignación ultra-robusta a la fila correspondiente (doble verificación por índice o nombre)
            let targetIdx = quickProductRowIdx;
            if (excelPreviewData && (targetIdx === null || targetIdx < 0 || targetIdx >= excelPreviewData.items.length)) {
                targetIdx = excelPreviewData.items.findIndex(it => 
                    !it.matched_product && (
                        (it.client_product_name || '').toLowerCase() === quickProductName.toLowerCase() ||
                        (it.product_name || '').toLowerCase() === quickProductName.toLowerCase()
                    )
                );
            }

            if (targetIdx !== null && targetIdx >= 0) {
                handleAssignProductToRow(targetIdx, newProd);
            }

            setIsQuickProductModalOpen(false);
            setQuickProductRowIdx(null);
            setActiveCellSearchRowIdx(null);
            showToast('Producto "' + newProd.name + '" (ID #' + newProd.accounting_id + ') creado y asignado exitosamente a la fila', 'success');`;

if (!content.includes(targetSaveLogic)) {
    console.error('Target save logic not found');
    process.exit(1);
}
content = content.replace(targetSaveLogic, replacementSaveLogic);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched CommercialAgreementsModule.tsx for Hallazgos 5 & 6');
