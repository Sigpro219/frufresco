const fs = require('fs');
const path = require('path');

const targetFile = path.resolve('C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco/src/app/admin/commercial/settings/page.tsx');
let content = fs.readFileSync(targetFile, 'utf8');

// 1. Reemplazar etiqueta de la pastilla segmentada
content = content.replace(
    /Listas de Cotizaci[óo]n<\/button>/g,
    'Modelos por Cliente (Canastas)</button>'
);

// 2. Reemplazar fetchTemplateItems y agregar handlers
const oldFetchTarget = `    const fetchTemplateItems = async (templateId: string) => {
        setLoadingTemplateItems(true);
        const { data, error } = await supabase
            .from('quote_template_items')
            .select('product_id, products(id, name, sku, accounting_id, category, unit_of_measure)')
            .eq('template_id', templateId);
        if (data) {
            const flattened = data.map((item: any) => ({
                product_id: item.product_id,
                ...item.products
            })).filter(item => item.id);
            setTemplateItems(flattened);
        } else {
            setTemplateItems([]);
        }
        setLoadingTemplateItems(false);
    };`;

const newFetchImpl = `    const fetchTemplateItems = async (templateId: string, currentTemplate?: any) => {
        setLoadingTemplateItems(true);
        const tpl = currentTemplate || selectedTemplate;
        try {
            // 1. Cargar productos de la canasta
            const { data, error } = await supabase
                .from('quote_template_items')
                .select('product_id, products(id, name, sku, accounting_id, category, unit_of_measure)')
                .eq('template_id', templateId);
            
            const flattened = (data || []).map((item: any) => ({
                product_id: item.product_id,
                ...item.products
            })).filter((item: any) => item.id);
            setTemplateItems(flattened);

            // 2. Cargar costos base vigentes de commercial_cost_matrix
            const { data: matrixCosts } = await supabase
                .from('commercial_cost_matrix')
                .select('product_id, manual_cost');
            const cMap: Record<string, number> = {};
            (matrixCosts || []).forEach((c: any) => {
                if (c.manual_cost) cMap[c.product_id] = Number(c.manual_cost);
            });
            setTemplateCosts(cMap);

            // 3. Cargar márgenes personalizados de la canasta desde app_settings
            const { data: sData } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', \`quote_template_margins:\${templateId}\`)
                .maybeSingle();
            let mObj: Record<string, number> = {};
            if (sData?.value) {
                try { mObj = JSON.parse(sData.value); } catch (e) {}
            }
            setTemplateMargins(mObj);

            // 4. Intentar emparejar con Casa Matriz y calcular demanda 30d
            const tplName = (tpl?.name || '').trim();
            if (tplName) {
                const { data: matchedProfiles } = await supabase
                    .from('profiles')
                    .select('id, company_name, razon_social')
                    .eq('role', 'b2b_client')
                    .or(\`company_name.ilike.%\${tplName}%,razon_social.ilike.%\${tplName}%\`)
                    .limit(1);

                const matched = matchedProfiles?.[0];
                setTemplateClientProfile(matched || null);

                if (matched) {
                    const { data: branches } = await supabase
                        .from('profiles')
                        .select('id')
                        .eq('parent_id', matched.id);

                    const clientIds = [matched.id, ...(branches || []).map(b => b.id)];
                    const cycleStartIso = new Date(Date.now() - 30 * 86400000).toISOString();

                    const { data: orders } = await supabase
                        .from('orders')
                        .select('id')
                        .in('profile_id', clientIds)
                        .gte('created_at', cycleStartIso)
                        .neq('status', 'cancelled');

                    const oIds = (orders || []).map(o => o.id);
                    const dMap: Record<string, { volume: number; ordersCount: number }> = {};

                    if (oIds.length > 0) {
                        for (let i = 0; i < oIds.length; i += 80) {
                            const slice = oIds.slice(i, i + 80);
                            const { data: items } = await supabase
                                .from('order_items')
                                .select('product_id, quantity')
                                .in('order_id', slice);

                            (items || []).forEach((it: any) => {
                                if (!it.product_id) return;
                                if (!dMap[it.product_id]) dMap[it.product_id] = { volume: 0, ordersCount: 0 };
                                dMap[it.product_id].volume += Number(it.quantity || 0);
                                dMap[it.product_id].ordersCount += 1;
                            });
                        }
                    }
                    setTemplateDemand(dMap);
                } else {
                    setTemplateDemand({});
                }
            } else {
                setTemplateDemand({});
                setTemplateClientProfile(null);
            }
        } catch (err) {
            console.error('Error cargando canasta de cliente:', err);
        } finally {
            setLoadingTemplateItems(false);
        }
    };

    const handleUpdateItemMargin = (productId: string, marginVal: number) => {
        setTemplateMargins(prev => ({ ...prev, [productId]: marginVal }));
    };

    const handleSaveTemplateMargins = async () => {
        if (!selectedTemplate) return;
        setSavingTemplateMargins(true);
        try {
            await supabase.from('app_settings').upsert({
                key: \`quote_template_margins:\${selectedTemplate.id}\`,
                value: JSON.stringify(templateMargins),
                description: \`Márgenes personalizados de canasta para \${selectedTemplate.name}\`
            });
            alert(\`¡Márgenes de la canasta "\${selectedTemplate.name}" guardados exitosamente!\`);
        } catch (err: any) {
            alert('Error guardando márgenes: ' + (err.message || err));
        } finally {
            setSavingTemplateMargins(false);
        }
    };`;

if (content.includes('const fetchTemplateItems = async (templateId: string) => {')) {
    // Buscar inicio y fin de la función
    const startIdx = content.indexOf('    const fetchTemplateItems = async (templateId: string) => {');
    const endStr = 'setLoadingTemplateItems(false);\n    };';
    const endIdx = content.indexOf(endStr, startIdx) + endStr.length;
    
    // Si no encontró con \n, probar con \r\n
    if (endIdx < endStr.length) {
        const endStrCRLF = 'setLoadingTemplateItems(false);\r\n    };';
        const endIdxCRLF = content.indexOf(endStrCRLF, startIdx) + endStrCRLF.length;
        content = content.substring(0, startIdx) + newFetchImpl + content.substring(endIdxCRLF);
    } else {
        content = content.substring(0, startIdx) + newFetchImpl + content.substring(endIdx);
    }
    console.log('fetchTemplateItems reemplazado exitosamente.');
} else {
    console.warn('No se encontró fetchTemplateItems.');
}

fs.writeFileSync(targetFile, content, 'utf8');
console.log('Paso 1 y 2 aplicados.');
