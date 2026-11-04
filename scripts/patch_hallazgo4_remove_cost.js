const fs = require('fs');
const path = require('path');

const filePath = path.join('C:', 'Users', 'German Higuera', 'OneDrive', 'Documentos', 'Projects', 'frufresco', 'src', 'components', 'CommercialAgreementsModule.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Remove cost basis input from QuickProductModal JSX
const targetGrid = `                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                                        Costo Base Estimado (COP)
                                    </label>
                                    <input 
                                        type="text"
                                        value={quickProductCostBasis}
                                        onChange={(e) => setQuickProductCostBasis(e.target.value)}
                                        placeholder="Ej. 3500"
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            border: '1.5px solid #CBD5E1',
                                            fontSize: '0.85rem',
                                            outline: 'none'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                                        Tarifa IVA (%)
                                    </label>
                                    <select
                                        value={quickProductIvaRate}
                                        onChange={(e) => setQuickProductIvaRate(Number(e.target.value))}
                                        style={{
                                            width: '100%',
                                            padding: '8px 10px',
                                            borderRadius: '8px',
                                            border: '1.5px solid #CBD5E1',
                                            fontSize: '0.82rem',
                                            backgroundColor: 'white',
                                            outline: 'none'
                                        }}
                                    >
                                        <option value={0}>0% (Exento / Agropecuario)</option>
                                        <option value={5}>5% (Bienes Especiales)</option>
                                        <option value={19}>19% (Tarifa General)</option>
                                    </select>
                                </div>
                            </div>`;

const replacementGrid = `                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                                    Tarifa IVA (%)
                                </label>
                                <select
                                    value={quickProductIvaRate}
                                    onChange={(e) => setQuickProductIvaRate(Number(e.target.value))}
                                    style={{
                                        width: '100%',
                                        padding: '8px 10px',
                                        borderRadius: '8px',
                                        border: '1.5px solid #CBD5E1',
                                        fontSize: '0.82rem',
                                        backgroundColor: 'white',
                                        outline: 'none'
                                    }}
                                >
                                    <option value={0}>0% (Exento / Agropecuario)</option>
                                    <option value={5}>5% (Bienes Especiales)</option>
                                    <option value={19}>19% (Tarifa General)</option>
                                </select>
                            </div>`;

if (!content.includes(targetGrid)) {
    console.error('Target grid not found in CommercialAgreementsModule.tsx');
    process.exit(1);
}
content = content.replace(targetGrid, replacementGrid);

// 2. In handleSaveQuickProduct, remove rawCost matrix upsert and set cost_basis to 0
const targetCostLogic = `            const rawCost = parsePriceValue(quickProductCostBasis);

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

            if (rawCost > 0) {
                await supabase.from('commercial_cost_matrix').upsert({
                    product_id: newProd.id,
                    manual_cost: rawCost,
                    is_active: true
                }, { onConflict: 'product_id' } as any).catch((e: any) => console.warn('Cost matrix notice:', e));
            }

            newProd.cost_basis = rawCost;`;

const replacementCostLogic = `            const { data: maxIdData } = await supabase
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

            newProd.cost_basis = 0;`;

if (!content.includes(targetCostLogic)) {
    console.error('Target cost logic not found in CommercialAgreementsModule.tsx');
    process.exit(1);
}
content = content.replace(targetCostLogic, replacementCostLogic);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched CommercialAgreementsModule.tsx (Hallazgo #4: removed Costo Base)');
