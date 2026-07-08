'use client';

import { CartProvider } from '../lib/cartContext';
import { AuthProvider } from '../lib/authContext';
import { useEffect } from 'react';
import { isAbortError } from '../lib/errorUtils';
import { APIProvider } from '@vis.gl/react-google-maps';

export function Providers({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const handleAbortError = (error: unknown) => {
            if (isAbortError(error)) {
                // Silently ignore framework-level fetch cancellations
                return true;
            }
            return false;
        };

        const handleAuthError = (error: unknown) => {
            if (!error) return false;
            const msg = String(
                (error as any)?.message || 
                (error as any)?.reason?.message || 
                error
            ).toLowerCase();
            
            if (
                msg.includes('jwt expired') || 
                msg.includes('token expired') || 
                msg.includes('refresh token') || 
                msg.includes('invalid refresh token') ||
                msg.includes('jwt')
            ) {
                console.warn('🚨 Auth/JWT Error detected. Resetting session and redirecting...');
                if (typeof window !== 'undefined') {
                    localStorage.clear();
                    // Clear all supabase auth tokens
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && (key.includes('sb-') || key.includes('supabase'))) {
                            localStorage.removeItem(key);
                        }
                    }
                    window.location.href = '/login?error=reset';
                }
                return true;
            }
            return false;
        };

        const onUnhandledRejection = (event: PromiseRejectionEvent) => {
            if (handleAuthError(event.reason)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                return;
            }
            if (handleAbortError(event.reason)) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        };

        const onError = (event: ErrorEvent) => {
            if (handleAuthError(event.error) || handleAuthError(event.message)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                return;
            }
            if (handleAbortError(event.error) || handleAbortError(event.message)) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        };

        // Aggressively silence console.error during development for these specific errors
        // as the Turbopack overlay sometimes triggers on logged errors.
        const originalConsoleError = console.error;
        console.error = (...args) => {
            let isJWTExpired = false;
            if (args.some(arg => {
                if (!arg) return false;
                if (isAbortError(arg)) return true;
                const argStr = String((arg as any)?.message || arg);
                if (argStr.toLowerCase().includes('jwt expired')) {
                    isJWTExpired = true;
                    return true;
                }
                if (
                    argStr.includes('Failed to fetch') || 
                    argStr.includes('TypeError: Failed to fetch') || 
                    argStr.includes('Error fetching drafts') ||
                    argStr.includes('The Google Maps JavaScript API could not load') ||
                    argStr.includes('maps.googleapis.com')
                ) {
                    return true;
                }
                return false;
            })) {
                if (isJWTExpired) {
                    handleAuthError('jwt expired');
                }
                return;
            }
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
        <APIProvider 
            apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''} 
            libraries={['places', 'marker', 'geometry']}
            onError={(err) => {
                console.warn('⚠️ Google Maps API failed to load (likely blocked by network or ad-blocker).', err);
            }}
        >
            <AuthProvider>
                <CartProvider>
                    {children}
                </CartProvider>
            </AuthProvider>
        </APIProvider>
    );
}
