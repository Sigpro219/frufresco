'use client';

import { Suspense, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import FloatingCartBar from '@/components/FloatingCartBar';
import SandboxModeBadge from '@/components/SandboxModeBadge';
import StorefrontHeader from '@/components/storefront/StorefrontHeader';
import { Providers } from '@/app/providers';
import { useCart } from '@/lib/cartContext';
import type { FrioganStorefrontMode, StorefrontRuntimeConfig } from '@/lib/storefront/storefrontContracts';
import { DEFAULT_STOREFRONT_CONFIG, isPublicStorefrontRoute } from '@/lib/storefront/storefrontEngine';

const GlobalBanner = dynamic(() => import('@/components/GlobalBanner'), { ssr: false });
const Footer = dynamic(() => import('@/components/Footer'), { ssr: false });
const Navbar = dynamic(() => import('@/components/Navbar'), { ssr: false });
const PQRFloatingWidget = dynamic(() => import('@/components/PQRFloatingWidget'), { ssr: false });
const CartDrawer = dynamic(() => import('@/components/storefront/CartDrawer'), { ssr: false });

interface ClientLayoutProps {
  children: React.ReactNode;
  initialStorefrontConfig?: StorefrontRuntimeConfig;
}

function StorefrontCartGuard({ frioganMode }: { frioganMode: FrioganStorefrontMode }) {
  const { isCartLoaded, sanitizeForFrioganMode } = useCart();
  useEffect(() => {
    if (isCartLoaded && frioganMode !== 'LIVE') {
      sanitizeForFrioganMode(frioganMode);
    }
  }, [isCartLoaded, frioganMode, sanitizeForFrioganMode]);
  return null;
}

export default function ClientLayout({ children, initialStorefrontConfig }: ClientLayoutProps) {
  const pathname = usePathname();
  const isOpsOrAdmin = pathname?.startsWith('/ops') || pathname?.startsWith('/admin');
  const isTrackPage = pathname?.startsWith('/track');
  const isPrintPage = pathname?.includes('/print') || pathname?.includes('-print');
  const isB2BDashboard = pathname === '/b2b/dashboard';
  const usePublicStorefront = isPublicStorefrontRoute(pathname);
  const storefrontConfig = initialStorefrontConfig || DEFAULT_STOREFRONT_CONFIG;

  return (
    <Providers>
      {!isPrintPage && <SandboxModeBadge />}
      {usePublicStorefront && <StorefrontCartGuard frioganMode={storefrontConfig.frioganMode} />}
      {usePublicStorefront ? (
        <Suspense fallback={<div style={{ height: '124px', backgroundColor: '#FAF9F6' }} />}>
          <StorefrontHeader config={storefrontConfig} />
        </Suspense>
      ) : (
        <>
          {!isOpsOrAdmin && !isTrackPage && !isPrintPage && (
            <Suspense fallback={null}>
              <GlobalBanner />
            </Suspense>
          )}
          {!pathname?.startsWith('/ops') && !isTrackPage && !isPrintPage && (
            <Suspense fallback={<div style={{ height: '85px', backgroundColor: 'white' }} />}>
              <Navbar />
            </Suspense>
          )}
        </>
      )}

      <Suspense
        fallback={
          <main style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAF9F6' }}>
            <div style={{ border: '3px solid #0D7A5720', borderTop: '3px solid #0D7A57', borderRadius: '50%', width: '36px', height: '36px', animation: 'spin 1s linear infinite' }} />
          </main>
        }
      >
        {children}
      </Suspense>

      {!isOpsOrAdmin && !isTrackPage && !isPrintPage && (
        <Suspense fallback={null}>
          <FloatingCartBar frioganMode={usePublicStorefront ? storefrontConfig.frioganMode : 'LIVE'} />
        </Suspense>
      )}

      {usePublicStorefront && (
        <Suspense fallback={null}>
          <CartDrawer config={storefrontConfig} suggestions={storefrontConfig.quickSuggestions} />
        </Suspense>
      )}

      {!isOpsOrAdmin && !isTrackPage && !isB2BDashboard && !isPrintPage && (
        <Suspense fallback={null}>
          <Footer initialConfig={usePublicStorefront ? storefrontConfig : undefined} />
        </Suspense>
      )}

      {isOpsOrAdmin && !isPrintPage && (
        <Suspense fallback={null}>
          <PQRFloatingWidget />
        </Suspense>
      )}
    </Providers>
  );
}
