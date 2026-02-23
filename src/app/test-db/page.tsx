'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function TestPage() {
    const [status, setStatus] = useState('Testing...');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        console.log('🔍 Testing Supabase connection to:', url);
        
        async function runTest() {
            const supabase = createClient();
            try {
                const { data, error, status: httpStatus } = await supabase
                    .from('app_settings')
                    .select('*')
                    .limit(1);
                
                if (error) {
                    console.error('❌ Supabase Error:', error);
                    setError(`Error ${error.code}: ${error.message} (HTTP ${httpStatus})`);
                    setStatus('Failed');
                } else {
                    console.log('✅ Connection Success!', data);
                    setStatus('Success: ' + (data?.length || 0) + ' settings found');
                }
            } catch (err: any) {
                if (err.name === 'AbortError') {
                    console.log('ℹ️ Request was aborted (common in Dev mode)');
                    // Don't set status to failed if it was just an abort, 
                    // maybe the second request is still coming.
                    return;
                }
                console.error('💥 Exception:', err);
                setError(err.message || 'Unknown error');
                setStatus('Exception');
            }
        }
        runTest();
    }, []);

    return (
        <div style={{ padding: '2rem', backgroundColor: '#fff', minHeight: '100vh', color: '#000' }}>
            <h1 style={{ marginBottom: '1rem' }}>Database Connection Test</h1>
            <div style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
                <p><strong>Configured URL:</strong> {process.env.NEXT_PUBLIC_SUPABASE_URL || 'UNDEFINED'}</p>
                <p><strong>Status:</strong> <span style={{ color: status === 'Success' ? 'green' : 'inherit' }}>{status}</span></p>
                {error && (
                    <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#fff5f5', border: '1px solid #feb2b2', borderRadius: '4px' }}>
                        <p style={{ color: '#c53030', margin: 0 }}><strong>Error Details:</strong></p>
                        <pre style={{ whiteSpace: 'pre-wrap', color: '#c53030' }}>{error}</pre>
                    </div>
                )}
            </div>
            <div style={{ marginTop: '2rem' }}>
                <button onClick={() => window.location.reload()} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
                    Reload Page
                </button>
            </div>
        </div>
    );
}
