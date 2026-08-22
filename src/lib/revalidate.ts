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
