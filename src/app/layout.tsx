import type { Metadata } from 'next';
import { Inter, Outfit } from 'next/font/google';
import "./globals.css";
import ClientLayout from '@/components/ClientLayout';
import { getAppSettings, getSeoSettings, getVisibleProducts } from '@/lib/data';
import { buildStorefrontRuntimeConfig, DEFAULT_STOREFRONT_CONFIG } from '@/lib/storefront/storefrontEngine';

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const outfit = Outfit({ 
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const defaultTitle = 'FruFresco | Tu despensa gourmet del campo a la ciudad';
  const defaultDescription = 'Abastecimiento de alimentos frescos para tu negocio y hogar.';

  try {
    const primary = await getSeoSettings();

    if (primary) {
      const title = primary.meta_title || defaultTitle;
      const description = primary.meta_description || defaultDescription;
      return {
        metadataBase: new URL('https://frufresco.co'),
        alternates: { canonical: '/' },
        title,
        description,
        keywords: primary.keywords?.join(', '),
        openGraph: {
          title,
          description,
          url: 'https://frufresco.co',
          siteName: 'FruFresco',
          locale: 'es_CO',
          type: 'website',
          images: [{ url: '/hero_fresh_produce.png', width: 1200, height: 630, alt: 'FruFresco — Frutas y verduras frescas del campo a la ciudad' }],
        },
        twitter: {
          card: 'summary_large_image',
          title,
          description,
          images: ['/hero_fresh_produce.png'],
        },
      };
    }
  } catch (e) {
    console.error('Metadata generation error:', e);
  }

  return {
    metadataBase: new URL('https://frufresco.co'),
    alternates: { canonical: '/' },
    title: defaultTitle,
    description: defaultDescription,
    openGraph: {
      title: defaultTitle,
      description: defaultDescription,
      url: 'https://frufresco.co',
      siteName: 'FruFresco',
      locale: 'es_CO',
      type: 'website',
      images: [{ url: '/hero_fresh_produce.png', width: 1200, height: 630, alt: 'FruFresco — Frutas y verduras frescas del campo a la ciudad' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: defaultTitle,
      description: defaultDescription,
      images: ['/hero_fresh_produce.png'],
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let initialStorefrontConfig = DEFAULT_STOREFRONT_CONFIG;
  try {
    const [settingsRows, visibleProducts] = await Promise.all([
      getAppSettings(),
      getVisibleProducts(),
    ]);
    initialStorefrontConfig = buildStorefrontRuntimeConfig(settingsRows || [], visibleProducts || []);
  } catch (err) {
    console.warn('RootLayout storefront config fallback active:', err);
  }

  return (
    <html lang="es" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <style dangerouslySetInnerHTML={{ __html: `
          #nextjs-portal, 
          [data-nextjs-dialog-overlay], 
          #__next-prerender-indicator,
          .nextjs-toast-errors-parent { 
            display: none !important; 
            visibility: hidden !important; 
            pointer-events: none !important; 
          }
        `}} />
        <script dangerouslySetInnerHTML={{ __html: `
          // 1. Detección proactiva de sesión corrupta
          if (localStorage.getItem('sb-csqurhdykbalvlnpowcz-auth-token') === 'undefined' || 
              localStorage.getItem('supabase.auth.token') === 'undefined') {
            localStorage.clear();
          }

          const isAuthError = (e) => {
            const msg = String(e?.message || e?.reason?.message || e || '').toLowerCase();
            return msg.includes('refresh token') || msg.includes('invalid refresh token') || msg.includes('jwt expired') || msg.includes('token expired') || msg.includes('jwt');
          };

          const isAbort = (e) => {
            const msg = String(e?.message || e?.reason?.message || e || '').toLowerCase();
            return msg.includes('abort') || msg.includes('signal') || msg.includes('cancel');
          };

          window.addEventListener('unhandledrejection', (e) => {
            if (isAuthError(e.reason)) {
              console.warn('Error de Sesión - Reiniciando...');
              localStorage.clear();
              window.location.href = '/login?error=reset';
              return;
            }
            if (isAbort(e.reason)) e.stopImmediatePropagation();
          }, true);

          window.addEventListener('error', (e) => {
            if (isAuthError(e.error) || isAuthError(e.message)) {
              localStorage.clear();
              window.location.href = '/login?error=reset';
              return;
            }
          }, true);
        `}} />

      </head>
      <body className={`${inter.variable} ${outfit.variable}`} style={{ fontFamily: 'var(--font-inter), sans-serif' }} suppressHydrationWarning>
        <ClientLayout initialStorefrontConfig={initialStorefrontConfig}>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
