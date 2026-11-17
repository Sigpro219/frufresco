/**
 * Triggers background on-demand revalidation for products and landing page cache.
 * Can be called silently without blocking UI operations.
 */
export async function triggerProductRevalidation() {
    try {
        await fetch('/api/revalidate?tag=products', {
            method: 'POST',
            cache: 'no-store'
        });
    } catch (err) {
        console.warn('Silent revalidation fetch error:', err);
    }
}

/**
 * Triggers background on-demand revalidation when storefront settings (e.g. Friogan toggle) change.
 */
export async function triggerStorefrontSettingsRevalidation() {
    try {
        await fetch('/api/revalidate?tag=settings&path=/', {
            method: 'POST',
            cache: 'no-store'
        });
    } catch (err) {
        console.warn('Silent settings revalidation fetch error:', err);
    }
}
