'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function OrdersPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/admin/orders/loading');
    }, [router]);

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', color: '#64748B', fontWeight: '600', fontSize: '0.9rem' }}>
            Redirigiendo a cargue de pedidos...
        </div>
    );
}
