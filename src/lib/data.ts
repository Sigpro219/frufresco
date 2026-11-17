import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { supabase, createAdminClient, type Product } from './supabase';
import { filterStorefrontProductsByFrioganMode } from './storefront/storefrontEngine';
import type { FrioganStorefrontMode } from './storefront/storefrontContracts';

const STOREFRONT_PRODUCT_FALLBACK_COLUMNS =
  'id, sku, name, display_name, name_en, description, category, inventory_group, tags, unit_of_measure, web_unit, weight_kg, options_config, image_url, web_conversion_factor, accounting_id, iva_rate, keywords, is_active, show_on_web, min_inventory_level';
const STOREFRONT_PRODUCT_COLUMNS = `${STOREFRONT_PRODUCT_FALLBACK_COLUMNS}, pricing_model_prices(price, model_id)`;

/**
 * Fetches all products visible on the web.
 * Cached for 1 hour by default and deduplicated per-request via React.cache.
 */
const getVisibleProductsCached = unstable_cache(
  async (pricingModelId?: string) => {
    const modelId = pricingModelId || 'f7043ca1-94d5-4d25-bd10-fbf30ce120ee';

    let lockedIds = new Set<string>();
    try {
      const { data: scarcitySetting } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'scarcity_locked_skus')
        .limit(1);
      if (scarcitySetting && scarcitySetting.length > 0 && scarcitySetting[0].value) {
        const parsed = JSON.parse(scarcitySetting[0].value);
        lockedIds = new Set(Object.keys(parsed));
      }
    } catch (e) {
      console.error('Error reading scarcity_locked_skus in getVisibleProducts:', e);
    }

    let dbClient: any = supabase;
    try {
      dbClient = createAdminClient();
    } catch (e) {
      // Safe fallback
    }

    const { data, error } = await dbClient
      .from('products')
      .select(STOREFRONT_PRODUCT_COLUMNS)
      .eq('is_active', true)
      .eq('show_on_web', true)
      .eq('pricing_model_prices.model_id', modelId)
      .order('name', { ascending: true })
      .limit(500);

    if (error) {
      console.error('Error fetching products with prices, trying fallback:', error.message);
      const { data: fallbackData, error: fallbackError } = await dbClient
        .from('products')
        .select(STOREFRONT_PRODUCT_FALLBACK_COLUMNS)
        .eq('is_active', true)
        .eq('show_on_web', true)
        .order('name', { ascending: true })
        .limit(500);
      if (fallbackError) {
        console.error('Fallback products fetch failed:', fallbackError);
        return [];
      }
      const fallbackList = ((fallbackData || []) as Product[]).filter(p => !lockedIds.has(p.id));
      return fallbackList.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));
    }
    const productList = ((data || []) as Product[]).filter(p => !lockedIds.has(p.id));
    return productList.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));
  },
  ['visible-products'],
  { revalidate: 60, tags: ['products'] }
);

export const getVisibleProducts = cache((pricingModelId?: string) => getVisibleProductsCached(pricingModelId));

const getProductSalesRankingCached = unstable_cache(
  async (): Promise<Record<string, number>> => {
    try {
      let dbClient: any = supabase;
      try {
        dbClient = createAdminClient();
      } catch {
        // Safe fallback
      }
      const { data, error } = await dbClient
        .from('order_items')
        .select('product_id')
        .not('product_id', 'is', null)
        .limit(3000);
      if (error || !data) return {};
      const counts: Record<string, number> = {};
      for (const row of data as Array<{ product_id?: string | null }>) {
        if (row?.product_id) {
          counts[row.product_id] = (counts[row.product_id] || 0) + 1;
        }
      }
      return counts;
    } catch {
      return {};
    }
  },
  ['product-sales-ranking'],
  { revalidate: 3600, tags: ['orders', 'products'] }
);

export const getProductSalesRanking = cache(() => getProductSalesRankingCached());

/**
 * Fetches app settings.
 * Cached for 1 hour and deduplicated per-request via React.cache.
 */
const getAppSettingsCached = unstable_cache(
  async () => {
    try {
      const { data, error } = await supabase.from('app_settings').select('key, value');
      if (error) {
        console.warn('Warning fetching app settings:', error.message || error);
        return [];
      }
      return data || [];
    } catch (err: any) {
      console.warn('Warning fetching app settings:', err?.message || err);
      return [];
    }
  },
  ['app-settings'],
  { revalidate: 3600, tags: ['settings'] }
);

export const getAppSettings = cache(() => getAppSettingsCached());

/**
 * Fetches unique categories from visible products.
 * Uses the cached products list.
 */
export const getWebCategories = unstable_cache(
  async (mode: FrioganStorefrontMode = 'OFF') => {
    const rawProducts = await getVisibleProducts();
    const products = filterStorefrontProductsByFrioganMode(rawProducts, mode);
    const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));
    return ['Todos', ...categories];
  },
  ['web-categories'],
  { revalidate: 60, tags: ['products', 'web-categories', 'settings'] }
);

/**
 * Fetches translation cache for English.
 */
export const getTranslationCache = unstable_cache(
  async () => {
    const { data, error } = await supabase
      .from('product_translations_cache')
      .select('source_text, translated_text')
      .eq('lang', 'en');
    
    if (error) return {};
    
    return (data || []).reduce((acc, item) => ({
        ...acc,
        [item.source_text]: item.translated_text
    }), {} as Record<string, string>);
  },
  ['translation-cache-en'],
  { revalidate: 3600, tags: ['translations'] }
);

/**
 * Fetches SEO settings.
 * Cached for 1 hour.
 */
export const getSeoSettings = unstable_cache(
  async () => {
    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase
      .from('seo_strategies')
      .select('*')
      .eq('is_active', true)
      .order('last_generated_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
        if (error.code !== 'PGRST116') { // PGRST116 is "no rows found", which is fine
          console.error('Error fetching SEO:', error);
        }
        return null;
    }
    return data;
  },
  ['seo-settings'],
  { revalidate: 3600, tags: ['seo'] }
);
