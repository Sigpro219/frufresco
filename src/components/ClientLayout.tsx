'use client';

import { usePathname } from 'next/navigation';
import GlobalBanner from '@/components/GlobalBanner';
import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';
import HelpDeskWidget from '@/components/HelpDeskWidget';
import PQRFloatingWidget from '@/components/PQRFloatingWidget';
import FloatingCartBar from '@/components/FloatingCartBar';
import { Providers } from '@/app/providers';
import { Suspense } from 'react';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isOpsOrAdmin = pathname?.startsWith('/ops') || pathname?.startsWith('/admin');
    const isPrintPage = pathname?.includes('/print') || pathname?.includes('-print');
    const isB2BDashboard = pathname === '/b2b/dashboard';

    return (
        <Providers>
            {!isOpsOrAdmin && !isPrintPage && <GlobalBanner />}
            {!pathname?.startsWith('/ops') && !isPrintPage && (
                <Suspense fallback={<div style={{ height: '85px', backgroundColor: 'white' }} />}>
                    <Navbar />
                </Suspense>
            )}
            <Suspense fallback={
                <main style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' }}>
                    <div style={{ border: '3px solid #0D7A5720', borderTop: '3px solid #0D7A57', borderRadius: '50%', width: '36px', height: '36px', animation: 'spin 1s linear infinite' }} />
                </main>
            }>
                {children}
            </Suspense>
            {!isOpsOrAdmin && !isPrintPage && <FloatingCartBar />}
            {!isOpsOrAdmin && !isB2BDashboard && !isPrintPage && <Footer />}
            {isOpsOrAdmin && !isPrintPage && <PQRFloatingWidget />}
        </Providers>
    );
}
