'use client';

import { usePathname } from 'next/navigation';
import GlobalBanner from '@/components/GlobalBanner';
import Footer from '@/components/Footer';
import { Providers } from '@/app/providers';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isOpsOrAdmin = pathname?.startsWith('/ops') || pathname?.startsWith('/admin');

    return (
        <Providers>
            {!isOpsOrAdmin && <GlobalBanner />}
            {children}
            {!isOpsOrAdmin && <Footer />}
        </Providers>
    );
}
