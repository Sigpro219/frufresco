export function isAbortError(err: unknown): boolean {
    if (!err) return false;
    
    // Convert to string for broad matching
    const errStr = String(err).toLowerCase();
    const e = err as Record<string, unknown>;
    const message = (String(e.message || '')).toLowerCase();
    const name = (String(e.name || '')).toLowerCase();
    const cause = e.cause ? String(e.cause).toLowerCase() : '';
    
    if (
        name.includes('abort') ||
        message.includes('abort') ||
        message.includes('signal') ||
        message.includes('cancel') ||
        errStr.includes('abort') ||
        errStr.includes('cancel') ||
        errStr.includes('signal') ||
        errStr.includes('refresh token') ||
        cause.includes('abort')
    ) {
        return true;
    }
    
    return false;
}

export function logError(context: string, err: unknown) {
    if (isAbortError(err)) return;
    console.error(`❌ [${context}]`, err);
}
