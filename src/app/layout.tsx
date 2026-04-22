import { Inter, Outfit } from 'next/font/google';
import "./globals.css";
import ClientLayout from '@/components/ClientLayout';

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
});

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
});

import { supabase } from '@/lib/supabase';

export async function generateMetadata() {
  try {
    const { data: strategies } = await supabase
      .from('seo_strategies')
      .select('*')
      .eq('is_active', true)
      .order('last_generated_at', { ascending: false });

    if (strategies && strategies.length > 0) {
      const primary = strategies[0];
      return {
        title: primary.meta_title,
        description: primary.meta_description,
        keywords: primary.keywords.join(', '),
      };
    }
  } catch (e) {
    console.error('Metadata generation error:', e);
  }

  return {
    title: 'FruFresco | Tu despensa gourmet del campo a la ciudad',
    description: 'Abastecimiento de alimentos frescos para tu negocio y hogar.',
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
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
          if (localStorage.getItem('sb-vuxisqojpsrvmhzunqyd-auth-token') === 'undefined' || 
              localStorage.getItem('supabase.auth.token') === 'undefined') {
            localStorage.clear();
          }

          const isAuthError = (e) => {
            const msg = String(e?.message || e?.reason?.message || e || '').toLowerCase();
            return msg.includes('refresh token') || msg.includes('invalid refresh token');
          };

          const isAbort = (e) => {
            const msg = String(e?.message || e?.reason?.message || e || '').toLowerCase();
            return msg.includes('abort') || msg.includes('signal') || msg.includes('cancel');
          };

          window.addEventListener('unhandledrejection', (e) => {
            if (isAuthError(e.reason)) {
              console.warn('🚨 Error de Sesión - Reiniciando...');
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
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
