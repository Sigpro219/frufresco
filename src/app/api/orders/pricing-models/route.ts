import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, fetchAllRows } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// In-memory cache with 60-second TTL to avoid hammering Supabase on frequent re-renders
let cachedData: {
  models: any[];
  modelPrices: Record<string, Record<string, number>>;
  timestamp: number;
} | null = null;

const CACHE_TTL_MS = 60_000;

export async function GET(req: NextRequest) {
  try {
    const now = Date.now();
    if (cachedData && (now - cachedData.timestamp < CACHE_TTL_MS)) {
      return NextResponse.json({
        models: cachedData.models,
        modelPrices: cachedData.modelPrices,
        cached: true
      });
    }

    const supabaseAdmin = createAdminClient();

    // 1. Fetch all pricing models
    const { data: models, error: modelsError } = await supabaseAdmin
      .from('pricing_models')
      .select('*');

    if (modelsError) {
      console.error('[API Pricing Models] Error fetching pricing_models:', modelsError);
      return NextResponse.json({ error: modelsError.message }, { status: 500 });
    }

    // 2. Fetch all pricing_model_prices using paginated admin query
    let allPrices: any[] = [];
    let pPage = 0;
    const pPageSize = 1000;
    while (true) {
      const { data: chunk, error } = await supabaseAdmin
        .from('pricing_model_prices')
        .select('model_id, product_id, price')
        .range(pPage * pPageSize, (pPage + 1) * pPageSize - 1);
      
      if (error || !chunk || chunk.length === 0) break;
      allPrices = allPrices.concat(chunk);
      if (chunk.length < pPageSize) break;
      pPage++;
    }

    const modelPricesMap: Record<string, Record<string, number>> = {};
    allPrices.forEach((row: any) => {
      if (!modelPricesMap[row.model_id]) {
        modelPricesMap[row.model_id] = {};
      }
      modelPricesMap[row.model_id][row.product_id] = Number(row.price);
    });

    cachedData = {
      models: models || [],
      modelPrices: modelPricesMap,
      timestamp: now
    };

    return NextResponse.json({
      models: models || [],
      modelPrices: modelPricesMap,
      totalPricesCount: allPrices.length,
      cached: false
    });
  } catch (err: any) {
    console.error('[API Pricing Models] Unexpected error:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
