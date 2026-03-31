/**
 * Centrally diagnoses Supabase Storage errors, specifically detection of 
 * HTML response (Unexpected token <) which indicates a configuration or proxy issue.
 */
export function diagnoseStorageError(error: any, bucketName: string) {
    if (!error) return null;
    
    const message = error.message || String(error);
    console.error(`🚨 Storage Error [${bucketName}]:`, error);

    if (message.includes('Unexpected token') || message.includes('<html')) {
        const diagnosis = `💡 DIAGNOSIS: The server returned HTML instead of JSON. 
        Possible causes:
        1. The bucket "${bucketName}" does not exist in Supabase.
        2. The bucket "${bucketName}" is private but being accessed without a session.
        3. A proxy, firewall, or ad-blocker is intercepting the request.
        4. Supabase Project URL is incorrect or paused.`;
        
        console.error(diagnosis);
        return `Error de servidor (HTML). Verifica que el bucket "${bucketName}" exista y sea público.`;
    }

    if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('Load failed')) {
        const diagnosis = `🌐 NETWORK DIAGNOSIS: The browser failed to reach the Supabase Storage API.
        Possible causes:
        1. An ad-blocker or tracker blocker is preventing the request.
        2. Your internet connection is unstable or DNS is failing.
        3. Supabase CORS configuration is blocking this request origin.
        4. A VPN or Firewall is blocking the connection.`;
        
        console.error(diagnosis);
        return `Error de conexión (Network). Verifica tu internet o desactiva bloqueadores de anuncios.`;
    }
    
    return message;
}

/**
 * Centrally diagnoses Supabase Database errors, specifically RLS (Row Level Security)
 * or permission denied issues which are common when moving between tenants.
 */
export function diagnoseDatabaseError(error: any, table: string, operation: string = 'Update') {
    if (!error) return null;
    
    const message = error.message || String(error);
    const code = error.code || '';
    
    console.error(`🚨 Database Error [${table} - ${operation}]:`, error);

    // Common RLS error code is 42501 (insufficient_privilege)
    if (code === '42501' || message.includes('permission denied') || message.includes('policy')) {
        const diagnosis = `⚠️ DIAGNOSIS DE INFRAESTRUCTURA: Error de permisos (RLS). 
        CAUSA: La tabla "${table}" no tiene políticas de escritura permitidas para este usuario/tenant.
        SOLUCIÓN: Debes ejecutar un script SQL en el panel de Supabase de este Tenant para habilitar ${operation}.
        EJEMPLO SQL: "CREATE POLICY \"Allow ${operation}\" ON ${table} FOR ${operation.toUpperCase()} USING (true) WITH CHECK (true);"`;
        
        console.error(diagnosis);
        return `Error de Permisos (SQL Sync Requerido). La base de datos del Tenant rechazó el ${operation}.`;
    }

    return message;
}

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
    
    // Better object representation for the console 
    if (err instanceof Error) {
        console.error(`❌ [${context}]`, {
            message: err.message,
            name: err.name,
            stack: err.stack,
            cause: (err as any).cause
        });
    } else if (err && typeof err === 'object') {
        const errorObj = err as Record<string, unknown>;
        if (!errorObj.message && !errorObj.stack) {
            try {
                const str = JSON.stringify(err);
                if (str === '{}') {
                    // Try to extract internal properties for standard objects that stringify empty
                    const detailed = JSON.stringify(err, Object.getOwnPropertyNames(err));
                    console.error(`❌ [${context}]`, detailed === '{}' ? err : detailed);
                } else {
                    console.error(`❌ [${context}]`, str);
                }
            } catch (e) {
                console.error(`❌ [${context}]`, err);
            }
        } else {
            console.error(`❌ [${context}]`, err);
        }
    } else {
        console.error(`❌ [${context}]`, err);
    }
}
