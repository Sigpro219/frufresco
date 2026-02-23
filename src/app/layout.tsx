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

export const metadata = {
  title: 'FruFresco | Proveedor de Alimentos',
  description: 'Abastecimiento de alimentos frescos para tu negocio.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
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
            if (isAbort(e.error) || isAbort(e.message)) e.stopImmediatePropagation();
          }, true);
        `}} />
      </head>
      <body className={`${inter.variable} ${outfit.variable}`} style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
