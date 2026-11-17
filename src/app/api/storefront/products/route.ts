import { NextResponse } from 'next/server';
import { getAppSettings, getProductSalesRanking, getVisibleProducts } from '@/lib/data';
import { createServerSideClient } from '@/lib/supabase/server';
import { CLIENTES_HOGAR_ID, resolvePricingModelId } from '@/lib/pricingUtils';
import {
  filterStorefrontProductsByFrioganMode,
  isOfferOrPromoProduct,
  parseFrioganStorefrontMode,
} from '@/lib/storefront/storefrontEngine';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const offset = Math.max(0, Number(searchParams.get('offset') || 0) || 0);
    const limit = Math.min(60, Math.max(1, Number(searchParams.get('limit') || 24) || 24));
    const category = (searchParams.get('category') || '').trim();
    const q = (searchParams.get('q') || '').trim().toLowerCase();

    const serverSupabase = await createServerSideClient();
    const { data: { session } } = await serverSupabase.auth.getSession();
    const userId = session?.user?.id;

    let pricingModelId = CLIENTES_HOGAR_ID;
    let hasActiveAgreement = false;
    let allowOffAgreement = true;
    const agreementMap = new Map<string, number>();
    const campaignMap = new Map<string, { value: number; type: string; name: string }>();
    const nicknameMap: Record<string, string> = {};

    if (userId) {
      const [{ data: profile }, { data: nicknamesData }] = await Promise.all([
        serverSupabase.from('profiles').select('role, pricing_model_id, parent_id, allow_off_agreement_purchases').eq('id', userId).maybeSingle(),
        serverSupabase.from('product_nicknames').select('product_id, nickname').eq('customer_id', userId),
      ]);
      for (const n of nicknamesData || []) {
        if (n.product_id && n.nickname) nicknameMap[n.product_id] = n.nickname;
      }
      pricingModelId = resolvePricingModelId(profile);
      const effectiveClientId = profile?.parent_id || userId;
      if (profile?.role === 'b2b_client') {
        allowOffAgreement = Boolean(profile.allow_off_agreement_purchases);
      }

      const [{ data: directQuote }, { data: modelRow }] = await Promise.all([
        serverSupabase.from('quotes').select('id, start_date, valid_until').eq('client_id', effectiveClientId).eq('status', 'agreement').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        serverSupabase.from('special_agreement_model_clients').select('model_id').eq('client_id', effectiveClientId).maybeSingle(),
      ]);

      let targetAgreementId = directQuote?.id;
      let startDate = directQuote?.start_date;
      let endDate = directQuote?.valid_until;
      if (!targetAgreementId && modelRow?.model_id) {
        const { data: sam } = await serverSupabase.from('special_agreement_models').select('master_quote_id').eq('id', modelRow.model_id).maybeSingle();
        if (sam?.master_quote_id) {
          const { data: mq } = await serverSupabase.from('quotes').select('id, start_date, valid_until').eq('id', sam.master_quote_id).eq('status', 'agreement').maybeSingle();
          if (mq) {
            targetAgreementId = mq.id;
            startDate = startDate || mq.start_date;
            endDate = endDate || mq.valid_until;
          }
        }
      }

      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
      const start = startDate?.split('T')[0];
      const end = endDate?.split('T')[0];
      const isVigente = Boolean(targetAgreementId) && !(start && start > todayStr) && !(end && end < todayStr);

      const [qItemsRes, targetCampRes] = await Promise.all([
        isVigente && targetAgreementId
          ? (hasActiveAgreement = true, serverSupabase.from('quote_items').select('product_id, unit_price').eq('quote_id', targetAgreementId))
          : Promise.resolve({ data: null }),
        serverSupabase.from('campaign_targets').select('campaign_id').eq('profile_id', effectiveClientId),
      ]);

      for (const qi of qItemsRes.data || []) {
        agreementMap.set(qi.product_id, qi.unit_price);
      }

      const campIds = (targetCampRes.data || []).map((tc: { campaign_id: string }) => tc.campaign_id);
      if (campIds.length > 0) {
        const nowIso = new Date().toISOString();
        const { data: activeCamps } = await serverSupabase
          .from('commercial_campaigns')
          .select('id, type, name')
          .in('id', campIds)
          .eq('status', 'active')
          .lte('start_date', nowIso)
          .gte('end_date', nowIso);
        if (activeCamps && activeCamps.length > 0) {
          const { data: cItems } = await serverSupabase
            .from('campaign_items')
            .select('campaign_id, product_id, adjustment_value')
            .in('campaign_id', activeCamps.map((c: { id: string }) => c.id));
          for (const ci of cItems || []) {
            const camp = activeCamps.find((c: { id: string }) => c.id === ci.campaign_id);
            if (camp) campaignMap.set(ci.product_id, { value: ci.adjustment_value, type: camp.type, name: camp.name });
          }
        }
      }
    }

    const [allRaw, settingsRows, salesRanking] = await Promise.all([
      getVisibleProducts(pricingModelId),
      getAppSettings(),
      getProductSalesRanking(),
    ]);

    const settingsMap = new Map<string, string>(
      (settingsRows || []).map((st: { key?: string; value?: string | null }) => [
        String(st?.key || ''),
        String(st?.value ?? ''),
      ])
    );
    const frioganMode = parseFrioganStorefrontMode(settingsMap.get('friogan_storefront_mode'));
    const eligible = filterStorefrontProductsByFrioganMode(allRaw || [], frioganMode)
      .filter((p) => !(hasActiveAgreement && !allowOffAgreement && !agreementMap.has(p.id)))
      .map((p) => {
        const agreementPrice = agreementMap.get(p.id);
        const basePrice = agreementPrice !== undefined ? agreementPrice : (p.pricing_model_prices?.[0]?.price ?? 0);
        const adj = campaignMap.get(p.id);
        let finalPrice = basePrice;
        let campaign_info = p.campaign_info;
        if (adj) {
          finalPrice = adj.type === 'percentage_discount'
            ? basePrice * (1 - adj.value / 100)
            : adj.type === 'fixed_discount'
              ? Math.max(0, basePrice - adj.value)
              : adj.value;
          campaign_info = { originalPrice: basePrice, campaignName: adj.name, adjustmentValue: adj.value, type: adj.type };
        }
        return {
          ...p,
          display_name: nicknameMap[p.id] || p.display_name || p.name,
          pricing_model_prices: [{ price: finalPrice, model_id: pricingModelId }],
          campaign_info,
        };
      });

    const catUpper = category.toUpperCase();
    const filtered = eligible.filter((p) => {
      if (category && category !== 'Todos') {
        if (catUpper === 'OFERTAS') {
          if (!isOfferOrPromoProduct(p)) return false;
        } else if ((p.category || '').trim().toUpperCase() !== catUpper) {
          return false;
        }
      }
      if (q) {
        const hay = `${p.display_name || ''} ${p.name || ''} ${p.name_en || ''} ${p.keywords || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const hasImgA = Boolean(a.image_url && a.image_url.trim().startsWith('http'));
      const hasImgB = Boolean(b.image_url && b.image_url.trim().startsWith('http'));
      const hasPriceA = Number(a.pricing_model_prices?.[0]?.price || 0) > 0;
      const hasPriceB = Number(b.pricing_model_prices?.[0]?.price || 0) > 0;
      const readyA = hasImgA && hasPriceA ? 1 : hasPriceA ? 0 : -1;
      const readyB = hasImgB && hasPriceB ? 1 : hasPriceB ? 0 : -1;
      if (readyA !== readyB) return readyB - readyA;

      const salesA = salesRanking[a.id] || 0;
      const salesB = salesRanking[b.id] || 0;
      if (salesA !== salesB) return salesB - salesA;

      return (a.display_name || a.name || '').localeCompare(b.display_name || b.name || '', 'es', {
        sensitivity: 'base',
        numeric: true,
      });
    });

    const items = filtered.slice(offset, offset + limit).map((p) => ({ ...p, keywords: '' }));
    return NextResponse.json({ items, totalCount: filtered.length });
  } catch (err) {
    console.error('Error in GET /api/storefront/products:', err);
    return NextResponse.json({ items: [], totalCount: 0 }, { status: 500 });
  }
}
