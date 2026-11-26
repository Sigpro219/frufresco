import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(filename) {
  const fullPath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Archivo requerido no encontrado: ${filename}`);
  }
  return dotenv.parse(fs.readFileSync(fullPath, 'utf8'));
}

function getBogotaToday() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

function parseCliArgs(argv) {
  let targetDate = getBogotaToday();
  let refresh = false;

  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--date=')) {
      targetDate = arg.slice('--date='.length).trim();
    } else if (arg === '--refresh') {
      refresh = true;
    }
  }

  return { targetDate, refresh };
}

async function fetchAllPaginated(queryBuilderFactory, pageSize = 500) {
  const all = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await queryBuilderFactory().range(from, to);
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

async function upsertInChunks(client, table, rows, onConflict = 'id', chunkSize = 100) {
  let okCount = 0;
  const failures = [];

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await client.from(table).upsert(chunk, { onConflict });
    if (!error) {
      okCount += chunk.length;
      continue;
    }

    // Fallback row-by-row so one bad record never aborts the rest
    for (const row of chunk) {
      const { error: rowError } = await client.from(table).upsert([row], { onConflict });
      if (rowError) {
        failures.push({ id: row.id, message: rowError.message });
      } else {
        okCount += 1;
      }
    }
  }

  return { okCount, failures };
}

async function main() {
  const { targetDate, refresh } = parseCliArgs(process.argv);

  const prodEnv = loadEnvFile('.env.local');
  const sbxEnv = loadEnvFile('.env.sandbox');

  const prodUrl = (prodEnv.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const sandboxUrl = (sbxEnv.NEXT_PUBLIC_SUPABASE_URL || '').trim();

  // Hard anti-footgun guard: NEVER write to production
  if (
    !prodUrl ||
    !sandboxUrl ||
    prodUrl === sandboxUrl ||
    !prodUrl.includes('csqurhdykbalvlnpowcz') ||
    !sandboxUrl.includes('xqhjlfhjnnrmwvklppsh')
  ) {
    console.error('[ABORT] Validacion URL Prod vs Sandbox fallida.');
    console.error({ prodUrl, sandboxUrl });
    process.exit(1);
  }

  const prod = createClient(prodUrl, prodEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sbx = createClient(sandboxUrl, sbxEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`[SYNC SANDBOX] Fecha objetivo (>= ${targetDate}) | Modo refresh: ${refresh ? 'SI' : 'NO (solo faltantes)'}`);

  // 1. Read-only fetch from PROD
  const prodOrders = await fetchAllPaginated(() =>
    prod.from('orders').select('*').gte('delivery_date', targetDate).order('created_at', { ascending: true })
  );

  // 2. Fetch existing IDs in SBX
  const sbxExisting = await fetchAllPaginated(() =>
    sbx.from('orders').select('id').gte('delivery_date', targetDate)
  );
  const sbxOrderIds = new Set(sbxExisting.map((r) => r.id));

  const candidateOrders = refresh
    ? prodOrders
    : prodOrders.filter((o) => !sbxOrderIds.has(o.id));

  console.log(
    `[SYNC SANDBOX] PROD >= ${targetDate}: ${prodOrders.length} pedidos | SBX existentes: ${sbxOrderIds.size} | Por sincronizar: ${candidateOrders.length}`
  );

  let syncedOrdersCount = 0;
  let syncedItemsCount = 0;
  const skippedNoProfile = [];

  if (candidateOrders.length > 0) {
    // 3. Validate customer profiles exist in Sandbox (profiles FK -> auth.users)
    const profileIds = [...new Set(candidateOrders.map((o) => o.profile_id).filter(Boolean))];
    const existingProfilesSet = new Set();
    for (let i = 0; i < profileIds.length; i += 200) {
      const slice = profileIds.slice(i, i + 200);
      const { data: profRows, error: profErr } = await sbx.from('profiles').select('id').in('id', slice);
      if (profErr) throw profErr;
      for (const p of profRows || []) existingProfilesSet.add(p.id);
    }

    const eligibleOrders = [];
    for (const order of candidateOrders) {
      if (order.profile_id && !existingProfilesSet.has(order.profile_id)) {
        skippedNoProfile.push({
          id: order.id,
          sequence_id: order.sequence_id,
          profile_id: order.profile_id,
        });
      } else {
        eligibleOrders.push(order);
      }
    }

    if (skippedNoProfile.length > 0) {
      console.error('[ERROR][SANDBOX SYNC] Pedidos omitidos porque su cliente (profile_id) fue creado hoy y no existe en auth.users del Sandbox:');
      console.table(skippedNoProfile);
      process.exitCode = 2;
    }

    if (eligibleOrders.length > 0) {
      // 4. Nullify assigned_route_id / billing_cut_id / invoice_id if referenced ID does not exist in Sandbox
      const routeIds = [...new Set(eligibleOrders.map((o) => o.assigned_route_id).filter(Boolean))];
      const cutIds = [...new Set(eligibleOrders.map((o) => o.billing_cut_id).filter(Boolean))];
      const invoiceIds = [...new Set(eligibleOrders.map((o) => o.invoice_id).filter(Boolean))];

      const validRouteIds = new Set();
      if (routeIds.length > 0) {
        const { data: routesInSbx } = await sbx.from('routes').select('id').in('id', routeIds);
        for (const r of routesInSbx || []) validRouteIds.add(r.id);
      }

      const validCutIds = new Set();
      if (cutIds.length > 0) {
        const { data: cutsInSbx } = await sbx.from('billing_cuts').select('id').in('id', cutIds);
        for (const c of cutsInSbx || []) validCutIds.add(c.id);
      }

      const validInvoiceIds = new Set();
      for (let i = 0; i < invoiceIds.length; i += 200) {
        const slice = invoiceIds.slice(i, i + 200);
        const { data: invoicesInSbx } = await sbx.from('invoices').select('id').in('id', slice);
        for (const inv of invoicesInSbx || []) validInvoiceIds.add(inv.id);
      }

      const preparedOrders = eligibleOrders.map((o) => {
        const clone = { ...o };
        if (clone.assigned_route_id && !validRouteIds.has(clone.assigned_route_id)) {
          clone.assigned_route_id = null;
        }
        if (clone.billing_cut_id && !validCutIds.has(clone.billing_cut_id)) {
          clone.billing_cut_id = null;
        }
        if (clone.invoice_id && !validInvoiceIds.has(clone.invoice_id)) {
          clone.invoice_id = null;
        }
        return clone;
      });

      // Parents before child splits if parent_order_id exists on schema
      preparedOrders.sort((a, b) => {
        const aHasParent = a.parent_order_id ? 1 : 0;
        const bHasParent = b.parent_order_id ? 1 : 0;
        return aHasParent - bHasParent;
      });

      const orderIdsToSync = preparedOrders.map((o) => o.id);

      // 5. Fetch order_items from PROD (READ-ONLY)
      const prodItems = [];
      for (let i = 0; i < orderIdsToSync.length; i += 100) {
        const slice = orderIdsToSync.slice(i, i + 100);
        const { data: items, error: itemsErr } = await prod
          .from('order_items')
          .select('*')
          .in('order_id', slice);
        if (itemsErr) throw itemsErr;
        prodItems.push(...(items || []));
      }

      // 6. Ensure all referenced products exist in SBX
      const productIds = [...new Set(prodItems.map((it) => it.product_id).filter(Boolean))];
      if (productIds.length > 0) {
        const existingProductIds = new Set();
        for (let i = 0; i < productIds.length; i += 200) {
          const slice = productIds.slice(i, i + 200);
          const { data: sbxProds, error: spErr } = await sbx.from('products').select('id').in('id', slice);
          if (spErr) throw spErr;
          for (const p of sbxProds || []) existingProductIds.add(p.id);
        }

        const missingProductIds = productIds.filter((id) => !existingProductIds.has(id));
        if (missingProductIds.length > 0) {
          const { data: prodProducts, error: ppErr } = await prod
            .from('products')
            .select('*')
            .in('id', missingProductIds);
          if (ppErr) throw ppErr;
          const prodRes = await upsertInChunks(sbx, 'products', prodProducts || [], 'id', 50);
          console.log(`[SYNC SANDBOX] Productos faltantes copiados: ${prodRes.okCount}`);
          if (prodRes.failures.length > 0) {
            console.warn('[WARN] Productos con error al copiar:', prodRes.failures);
          }
        }
      }

      // 7. Upsert orders (parents first if applicable, else all cleanly)
      const parentOrders = preparedOrders.filter((o) => !o.parent_order_id);
      const childOrders = preparedOrders.filter((o) => Boolean(o.parent_order_id));

      const resParents = await upsertInChunks(sbx, 'orders', parentOrders, 'id', 50);
      const resChildren = childOrders.length
        ? await upsertInChunks(sbx, 'orders', childOrders, 'id', 50)
        : { okCount: 0, failures: [] };

      syncedOrdersCount = resParents.okCount + resChildren.okCount;
      const orderFailures = [...resParents.failures, ...resChildren.failures];
      if (orderFailures.length > 0) {
        console.warn('[WARN] Pedidos con error al insertar/actualizar:', orderFailures);
      }

      // 8. Upsert order_items ONLY for orders that succeeded (and prune orphans in --refresh mode)
      const failedOrderIdSet = new Set(orderFailures.map((f) => f.id));
      const succeededOrderIds = orderIdsToSync.filter((id) => !failedOrderIdSet.has(id));
      const eligibleItems = prodItems.filter((it) => !failedOrderIdSet.has(it.order_id));

      if (refresh && succeededOrderIds.length > 0) {
        const expectedItemIds = new Set(eligibleItems.map((it) => it.id));
        const existingSbxItemIds = [];
        for (let i = 0; i < succeededOrderIds.length; i += 100) {
          const slice = succeededOrderIds.slice(i, i + 100);
          const { data: sbxItems, error: siErr } = await sbx
            .from('order_items')
            .select('id')
            .in('order_id', slice);
          if (siErr) throw siErr;
          for (const row of sbxItems || []) existingSbxItemIds.push(row.id);
        }
        const orphanIds = existingSbxItemIds.filter((id) => !expectedItemIds.has(id));
        if (orphanIds.length > 0) {
          for (let i = 0; i < orphanIds.length; i += 100) {
            const delSlice = orphanIds.slice(i, i + 100);
            const { error: delErr } = await sbx.from('order_items').delete().in('id', delSlice);
            if (delErr) throw delErr;
          }
          console.log(`[SYNC SANDBOX] --refresh depuro ${orphanIds.length} order_items huerfanos.`);
        }
      }

      if (eligibleItems.length > 0) {
        const resItems = await upsertInChunks(sbx, 'order_items', eligibleItems, 'id', 100);
        syncedItemsCount = resItems.okCount;
        if (resItems.failures.length > 0) {
          console.warn('[WARN] Lineas order_items con error:', resItems.failures);
        }
      }
    }
  }

  // 9. Final status summary in Sandbox for targetDate
  const sbxTargetOrders = await fetchAllPaginated(() =>
    sbx.from('orders').select('id, status').eq('delivery_date', targetDate)
  );
  const byStatus = sbxTargetOrders.reduce((acc, row) => {
    const k = row.status || 'unknown';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  console.log('\n================ RESUMEN SYNC SANDBOX ================');
  console.log(`Fecha objetivo             : ${targetDate}`);
  console.log(`Pedidos sincronizados      : ${syncedOrdersCount}`);
  console.log(`Items sincronizados        : ${syncedItemsCount}`);
  console.log(`Omitidos (sin profile SBX) : ${skippedNoProfile.length}`);
  console.log(`Total SBX para ${targetDate}  : ${sbxTargetOrders.length}`);
  console.table(byStatus);
  console.log('======================================================');
}

main().catch((err) => {
  console.error('[SYNC ERROR]', err);
  process.exit(1);
});
