'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode, useRef } from 'react';
import { useAuth } from './authContext';

export interface CartItem {
    id: string;
    name: string;
    price: number;
    iva_rate?: number;
    unit?: string;
    quantity: number;
    image_url?: string;
    variant_label?: string;
    selected_options?: Record<string, string>;
    weight_kg?: number;
    is_from_last_order?: boolean;
    is_friogan?: boolean;
    accounting_id?: number | null;
    presentation_key?: string;
}

interface CartContextType {
    items: CartItem[];
    addItem: (item: CartItem) => void;
    removeItem: (id: string, name: string) => void;
    clearCart: () => void;
    updateItemQuantity: (id: string, name: string, quantity: number) => void;
    totalItems: number;
    lineCount: number;
    totalPrice: number;
    totalWeight: number;
    hasFrioganItems: boolean;
    isCartLoaded: boolean;
    isDrawerOpen: boolean;
    openDrawer: () => void;
    closeDrawer: () => void;
    sanitizeForFrioganMode: (mode: 'OFF' | 'TEASER' | 'LIVE') => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<CartItem[]>([]);
    const [isCartLoaded, setIsCartLoaded] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const { user } = useAuth();
    const prevUserRef = useRef<string | null>(null);

    // 1. Initial Load from LocalStorage
    useEffect(() => {
        const saved = localStorage.getItem('frufresco_cart') || localStorage.getItem('logistics_pro_cart');
        if (saved) {
            try {
                setItems(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to parse cart', e);
            }
        }
        // Clean legacy key if present
        if (localStorage.getItem('logistics_pro_cart')) {
            localStorage.removeItem('logistics_pro_cart');
        }
        setIsCartLoaded(true);
    }, []);

    // 2. Clear cart on Logout/Login
    // This solves the issue where the cart persists after switching accounts
    useEffect(() => {
        const currentUserId = user?.id || null;
        
        // Check if user changed
        if (prevUserRef.current !== currentUserId) {
            // We only clear if there was a previous user (Logout)
            // or if we want a fresh start on every login too.
            if (prevUserRef.current !== null) {
                console.log('Sesión cambiada: Vacíando carrito por seguridad.');
                setItems([]);
                localStorage.removeItem('frufresco_cart');
                localStorage.removeItem('logistics_pro_cart');
            }
            prevUserRef.current = currentUserId;
        }
    }, [user]);

    // 3. Persistent Sync to LocalStorage
    useEffect(() => {
        if (!isCartLoaded) return;
        localStorage.setItem('frufresco_cart', JSON.stringify(items));
    }, [items, isCartLoaded]);

    const addItem = useCallback((newItem: CartItem) => {
        setItems((prev) => {
            const existing = prev.find((i) => i.id === newItem.id && i.name === newItem.name);
            if (existing) {
                return prev.map((i) =>
                    (i.id === newItem.id && i.name === newItem.name)
                        ? { ...i, quantity: i.quantity + newItem.quantity, is_from_last_order: newItem.is_from_last_order ?? i.is_from_last_order }
                        : i
                );
            }
            return [...prev, newItem];
        });
    }, []);

    const removeItem = useCallback((id: string, name: string) => {
        setItems((prev) => prev.filter((i) => !(i.id === id && i.name === name)));
    }, []);

    const clearCart = useCallback(() => {
        setItems([]);
        localStorage.removeItem('frufresco_cart');
        localStorage.removeItem('logistics_pro_cart');
    }, []);

    const updateItemQuantity = useCallback((id: string, name: string, quantity: number) => {
        if (quantity <= 0) {
            removeItem(id, name);
            return;
        }
        setItems((prev) =>
            prev.map((i) =>
                (i.id === id && i.name === name)
                    ? { ...i, quantity: quantity }
                    : i
            )
        );
    }, [removeItem]);

    const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
    const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);
    const sanitizeForFrioganMode = useCallback((mode: 'OFF' | 'TEASER' | 'LIVE') => {
        if (mode === 'LIVE') return;
        setItems((prev) => {
            const hasFriogan = prev.some((i) => Boolean(i.is_friogan));
            return hasFriogan ? prev.filter((i) => !i.is_friogan) : prev;
        });
    }, []);

    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const lineCount = items.length;
    const hasFrioganItems = items.some((item) => Boolean(item.is_friogan));
    const totalPrice = items.reduce((sum, item) => sum + Math.ceil((item.price * item.quantity) / 50) * 50, 0);
    const totalWeight = items.reduce((sum, item) => {
        const unitLower = (item.unit || '').toLowerCase();
        const isWeightUnit = ['kg', 'kilo', 'kilos'].includes(unitLower);
        const isLibra = ['libra', 'libras'].includes(unitLower);
        const uw = item.weight_kg !== undefined ? item.weight_kg : (isWeightUnit ? 1 : isLibra ? 0.5 : 0);
        return sum + uw * item.quantity;
    }, 0);

    const value = useMemo<CartContextType>(() => ({
        items,
        addItem,
        removeItem,
        clearCart,
        updateItemQuantity,
        totalItems,
        lineCount,
        totalPrice,
        totalWeight,
        hasFrioganItems,
        isCartLoaded,
        isDrawerOpen,
        openDrawer,
        closeDrawer,
        sanitizeForFrioganMode,
    }), [
        items,
        addItem,
        removeItem,
        clearCart,
        updateItemQuantity,
        totalItems,
        lineCount,
        totalPrice,
        totalWeight,
        hasFrioganItems,
        isCartLoaded,
        isDrawerOpen,
        openDrawer,
        closeDrawer,
        sanitizeForFrioganMode,
    ]);

    return (
        <CartContext.Provider value={value}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (!context) {
        throw new Error('useCart must be used within a CartProvider');
    }
    return context;
}
