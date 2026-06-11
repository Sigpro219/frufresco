'use client';

import { usePathname } from 'next/navigation';
import GlobalBanner from '@/components/GlobalBanner';
import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';
import HelpDeskWidget from '@/components/HelpDeskWidget';
import PQRFloatingWidget from '@/components/PQRFloatingWidget';
import { Providers } from '@/app/providers';
import { Suspense } from 'react';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isOpsOrAdmin = pathname?.startsWith('/ops') || pathname?.startsWith('/admin');
    const isPrintPage = pathname?.includes('/print');

    return (
        <Providers>
            <Suspense fallback={null}>
                {!isOpsOrAdmin && <GlobalBanner />}
                {!pathname?.startsWith('/ops') && !isPrintPage && <Navbar />}
                {children}
                {!isOpsOrAdmin && <Footer />}
            </Suspense>
            {isOpsOrAdmin && !isPrintPage && (
                <>
                    {/* <HelpDeskWidget /> */}
                    <PQRFloatingWidget />
                </>
            )}
        </Providers>
    );
}
