import { Inter } from 'next/font/google';
import "./globals.css";
import ClientLayout from '@/components/ClientLayout';

const inter = Inter({ subsets: ['latin'] });

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
        <script dangerouslySetInnerHTML={{ __html: `
          const isAbort = (e) => {
            const msg = String(e?.message || e?.reason?.message || e || '').toLowerCase();
            return msg.includes('abort') || msg.includes('signal') || msg.includes('cancel');
          };
          window.addEventListener('unhandledrejection', (e) => {
            if (isAbort(e.reason)) e.stopImmediatePropagation();
          }, true);
          window.addEventListener('error', (e) => {
            if (isAbort(e.error) || isAbort(e.message)) e.stopImmediatePropagation();
          }, true);
          const orig = console.error;
          console.error = (...args) => {
            if (args.some(isAbort)) return;
            orig.apply(console, args);
          };
        `}} />
      </head>
      <body className={inter.className}>
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
