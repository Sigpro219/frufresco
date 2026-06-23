'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function AuditRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/admin/command-center?tab=audit');
    }, [router]);

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6', fontFamily: 'sans-serif' }}>
            <Loader2 size={40} className="animate-spin" style={{ color: '#3B82F6', marginBottom: '1rem' }} />
            <p style={{ color: '#475569', fontWeight: '700' }}>Redireccionando al Centro de Mando Técnico...</p>
            <style jsx>{`
                .animate-spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
