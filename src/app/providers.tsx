'use client';

import { CartProvider } from '../lib/cartContext';
import { AuthProvider } from '../lib/authContext';
import { useEffect } from 'react';
import { isAbortError } from '../lib/errorUtils';

export function Providers({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const handleAbortError = (error: unknown) => {
            if (isAbortError(error)) {
                // Silently ignore framework-level fetch cancellations
                return true;
            }
            return false;
        };

        const onUnhandledRejection = (event: PromiseRejectionEvent) => {
            if (handleAbortError(event.reason)) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        };

        const onError = (event: ErrorEvent) => {
            if (handleAbortError(event.error) || handleAbortError(event.message)) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        };

        // Aggressively silence console.error during development for these specific errors
        // as the Turbopack overlay sometimes triggers on logged errors.
        const originalConsoleError = console.error;
        console.error = (...args) => {
            if (args.some(arg => isAbortError(arg))) return;
            originalConsoleError.apply(console, args);
        };

        window.addEventListener('unhandledrejection', onUnhandledRejection, true);
        window.addEventListener('error', onError, true);

        return () => {
            window.removeEventListener('unhandledrejection', onUnhandledRejection, true);
            window.removeEventListener('error', onError, true);
            console.error = originalConsoleError;
        };
    }, []);

    return (
        <AuthProvider>
            <CartProvider>
                {children}
            </CartProvider>
        </AuthProvider>
    );
}
