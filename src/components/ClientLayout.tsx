'use client';

import { usePathname } from 'next/navigation';
import GlobalBanner from '@/components/GlobalBanner';
import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';
import HelpDeskWidget from '@/components/HelpDeskWidget';
import { Providers } from '@/app/providers';
import { Suspense } from 'react';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isOpsOrAdmin = pathname?.startsWith('/ops') || pathname?.startsWith('/admin');

    return (
        <Providers>
            <Suspense fallback={null}>
                {!isOpsOrAdmin && <GlobalBanner />}
                <Navbar />
                {children}
                {!isOpsOrAdmin && <Footer />}
            </Suspense>
            {isOpsOrAdmin && <HelpDeskWidget />}
        </Providers>
    );
}
