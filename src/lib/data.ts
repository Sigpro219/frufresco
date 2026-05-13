import { unstable_cache } from 'next/cache';
import { supabase, type Product } from './supabase';

/**
 * Fetches all products visible on the web.
 * Cached for 1 hour by default.
 */
export const getVisibleProducts = unstable_cache(
  async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .eq('show_on_web', true)
      .order('image_url', { ascending: false, nullsFirst: false })
      .limit(500);

    if (error) {
      console.error('Error fetching products:', error);
      return [];
    }
    return data as Product[];
  },
  ['visible-products'],
  { revalidate: 3600, tags: ['products'] }
);

/**
 * Fetches app settings.
 * Cached for 1 hour.
 */
export const getAppSettings = unstable_cache(
  async () => {
    const { data, error } = await supabase.from('app_settings').select('key, value');
    if (error) {
      console.error('Error fetching app settings:', error);
      return [];
    }
    return data || [];
  },
  ['app-settings'],
  { revalidate: 3600, tags: ['settings'] }
);

/**
 * Fetches unique categories from visible products.
 * Uses the cached products list.
 */
export const getWebCategories = unstable_cache(
  async () => {
    const products = await getVisibleProducts();
    const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));
    return ['Todos', ...categories];
  },
  ['web-categories'],
  { revalidate: 3600, tags: ['products'] }
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
    const { data, error } = await supabase
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
