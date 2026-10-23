require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function syncAllClientTemplates() {
    console.log('--- SINCRONIZANDO CANASTAS POR CLIENTE (CASAS MATRICES) ---');

    // 1. Obtener todas las Casas Matrices B2B
    const { data: matrices, error: mErr } = await supabase
        .from('profiles')
        .select('id, company_name, razon_social, nit')
        .eq('role', 'b2b_client')
        .is('parent_id', null)
        .order('company_name');

    if (mErr) throw mErr;
    console.log(`Total Casas Matrices detectadas: ${matrices.length}`);

    // 2. Obtener templates existentes
    const { data: existingTemplates, error: tErr } = await supabase.from('quote_templates').select('id, name');
    if (tErr) throw tErr;

    const existingNames = new Set((existingTemplates || []).map(t => t.name.toLowerCase().trim()));

    let createdCount = 0;
    let itemsCount = 0;

    for (const m of matrices) {
        const name = (m.company_name || m.razon_social || '').trim();
        if (!name) continue;

        if (existingNames.has(name.toLowerCase())) {
            continue; // Ya existe
        }

        // Crear template
        const { data: newT, error: insErr } = await supabase
            .from('quote_templates')
            .insert({
                name: name,
                description: `Canasta institucional exclusiva para ${name} (NIT: ${m.nit || 'S/N'})`
            })
            .select()
            .single();

        if (insErr) {
            console.error(`Error creando template para ${name}:`, insErr);
            continue;
        }

        createdCount++;

        // Buscar sucursales y pedidos
        const { data: branches } = await supabase.from('profiles').select('id').eq('parent_id', m.id);
        const allIds = [m.id, ...(branches || []).map(b => b.id)];

        const { data: orders } = await supabase
            .from('orders')
            .select('id')
            .in('profile_id', allIds)
            .neq('status', 'cancelled')
            .limit(100);

        const orderIds = (orders || []).map(o => o.id);

        if (orderIds.length > 0) {
            const { data: items } = await supabase
                .from('order_items')
                .select('product_id')
                .in('order_id', orderIds);

            const uniqueProductIds = [...new Set((items || []).map(it => it.product_id).filter(Boolean))];

            if (uniqueProductIds.length > 0) {
                const rowsToInsert = uniqueProductIds.map(pId => ({
                    template_id: newT.id,
                    product_id: pId
                }));

                const { error: insItemErr } = await supabase
                    .from('quote_template_items')
                    .insert(rowsToInsert);

                if (!insItemErr) {
                    itemsCount += rowsToInsert.length;
                    console.log(`[OK] ${name} -> Creada con ${rowsToInsert.length} productos históricos.`);
                }
            } else {
                console.log(`[OK] ${name} -> Creada vacía (sin pedidos históricos).`);
            }
        } else {
            console.log(`[OK] ${name} -> Creada vacía (sin pedidos históricos).`);
        }
    }

    console.log(`\n🎉 Sincronización completada: ${createdCount} nuevas listas de cliente creadas, ${itemsCount} productos asignados.`);
}

syncAllClientTemplates().catch(console.error);
