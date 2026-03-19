'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';
import { useAuth } from './authContext';

export interface CartItem {
    id: string;
    name: string;
    price: number;
    iva_rate?: number;
    quantity: number;
    image_url?: string;
    variant_label?: string;
    selected_options?: Record<string, string>;
}

interface CartContextType {
    items: CartItem[];
    addItem: (item: CartItem) => void;
    removeItem: (id: string, name: string) => void;
    clearCart: () => void;
    totalItems: number;
    totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<CartItem[]>([]);
    const { user } = useAuth();
    const prevUserRef = useRef<string | null>(null);

    // 1. Initial Load from LocalStorage
    useEffect(() => {
        const saved = localStorage.getItem('logistics_pro_cart');
        if (saved) {
            try {
                setItems(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to parse cart', e);
            }
        }
    }, []);

    // 2. Clear cart on Logout/Login
    // This solves the issue where the cart persists after switching accounts
    useEffect(() => {
        const currentUserId = user?.id || null;
        
        // Check if user changed
        if (prevUserRef.current !== currentUserId) {
            // We only clear if there was a previous user (Logout)
            // or if we want a fresh start on every login too.
            // Based on user request "entrar y salir... no se vacía", we clear on any state change.
            if (prevUserRef.current !== null) {
                console.log('🛒 Sesión cambiada: Vacíando carrito por seguridad.');
                setItems([]);
                localStorage.removeItem('frufresco_cart');
            }
            prevUserRef.current = currentUserId;
        }
    }, [user]);

    // 3. Persistent Sync to LocalStorage
    useEffect(() => {
        localStorage.setItem('logistics_pro_cart', JSON.stringify(items));
    }, [items]);

    const addItem = (newItem: CartItem) => {
        setItems((prev) => {
            const existing = prev.find((i) => i.id === newItem.id && i.name === newItem.name);
            if (existing) {
                return prev.map((i) =>
                    (i.id === newItem.id && i.name === newItem.name)
                        ? { ...i, quantity: i.quantity + newItem.quantity }
                        : i
                );
            }
            return [...prev, newItem];
        });
    };

    const removeItem = (id: string, name: string) => {
        setItems((prev) => prev.filter((i) => !(i.id === id && i.name === name)));
    };

    const clearCart = () => {
        setItems([]);
        localStorage.removeItem('frufresco_cart');
    };

    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    return (
        <CartContext.Provider value={{ items, addItem, removeItem, clearCart, totalItems, totalPrice }}>
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
