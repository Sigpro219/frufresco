'use client';

import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { isAbortError } from '@/lib/errorUtils';

// Types
type Product = {
    id: string;
    name: string;
    category: string;
    unit_of_measure: string;
};

type CellData = {
    ordered: number;
    picked: number;
    hasRejection: boolean;
    hasWarning: boolean;
    items: { id: string, ordered: number, picked: number, quality_status?: string | null }[];
};

// Initialize Supabase outside the component to keep it stable
const supabase = createClient();

export default function PickingDashboard() {
    const router = useRouter();
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    // STATE
    const [matrix, setMatrix] = useState<Record<string, Record<string, CellData>>>({});
    const [clients, setClients] = useState<{ id: string, company_name: string, zone_name: string }[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState('');
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        // Hydration fix for time
        setCurrentTime(new Date().toLocaleTimeString());
        const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
        return () => clearInterval(timer);
    }, []);

    const loadData = useCallback(async (signal?: AbortSignal, silent = false) => {
        if (!silent) setLoading(true);
        try {
            // 1. Fetch Active Orders (matching Captain's criteria)
            let ordersQuery = supabase
                .from('orders')
                .select(`
                    id, customer_name, status,
                    order_items (
                        id, product_id, quantity, picked_quantity, quality_status
                    )
                `)
                .neq('status', 'cancelled');
            
            if (signal) ordersQuery = ordersQuery.abortSignal(signal);

            const { data: orders } = await ordersQuery;

            const activeClientNames = Array.from(new Set((orders || []).map(o => o.customer_name).filter(n => !!n)));

            // 2. Fetch Profiles to get zones
            const { data: profiles } = await supabase.from('profiles')
                .select('id, company_name, delivery_zone_id')
                .eq('role', 'b2b_client')
                .abortSignal(signal as any);
            
            const profileMap = new Map((profiles || []).map(p => [p.company_name, p]));

            // Fetch Zones for Mapping
            const { data: zones } = await supabase.from('delivery_zones').select('id, name').abortSignal(signal as any);
            const zoneMap = new Map((zones || []).map(z => [z.id, z.name]));

            // Build clients from ORDERS (Source of Truth)
            const formattedClients = activeClientNames
                .map(name => {
                    const profile = profileMap.get(name);
                    const zoneName = (profile ? zoneMap.get(profile.delivery_zone_id) : null) || 'GENERAL';
                    return {
                        id: profile?.id || name,
                        company_name: name,
                        zone_name: zoneName
                    };
                })
                .sort((a, b) => {
                    const zoneA = a.zone_name.toUpperCase();
                    const zoneB = b.zone_name.toUpperCase();
                    if (zoneA !== zoneB) return zoneA.localeCompare(zoneB);
                    
                    const nameA = a.company_name.toUpperCase();
                    const nameB = b.company_name.toUpperCase();
                    return nameA.localeCompare(nameB);
                });

            if (isMounted.current) setClients(formattedClients);

            // 3. Fetch Products
            const { data: prods } = await supabase
                .from('products')
                .select('id, name, category, unit_of_measure')
                .order('category')
                .order('name')
                .abortSignal(signal as any);
                
            if (isMounted.current) setProducts(prods as Product[] || []);

            // 4. Build Matrix
            const newMatrix: Record<string, Record<string, CellData>> = {};
            if (orders) {
                orders.forEach(order => {
                    const clientName = order.customer_name;
                    if (order.order_items) {
                        order.order_items.forEach((item: { product_id: string, quantity: number, picked_quantity: number, quality_status?: string | null, id: string }) => {
                            // Unified item storage regardless of category (TV needs full context for progress)
                            if (!newMatrix[item.product_id]) newMatrix[item.product_id] = {};
                            const currentCell = newMatrix[item.product_id][clientName] || { ordered: 0, picked: 0, hasRejection: false, hasWarning: false, items: [] };
                            const qty = Number(item.quantity) || 0;
                            const picked = Number(item.picked_quantity) || 0;
                            const rejected = item.quality_status === 'red';
                            const warning = item.quality_status === 'yellow';
                            
                            newMatrix[item.product_id][clientName] = {
                                ordered: currentCell.ordered + qty,
                                picked: currentCell.picked + picked,
                                hasRejection: currentCell.hasRejection || rejected,
                                hasWarning: currentCell.hasWarning || warning,
                                items: [...currentCell.items, { id: item.id, ordered: qty, picked: picked, quality_status: item.quality_status }]
                            };
                        });
                    }
                });
            }
            if (!isMounted.current) return;
            setMatrix(newMatrix);
        } catch (err: unknown) {
            if (!isMounted.current) return;
            if (isAbortError(err)) return;
            console.error('Error loading dashboard data:', err);
        } finally {
            if (isMounted.current && !silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();

        // Realtime Subscription - UNIFIED CHANNEL
        const channel = supabase.channel('picking-realtime', {
            config: {
                broadcast: { ack: true }
            }
        })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, (payload) => {
                console.log('⚡ DB Update:', payload);
                loadData(undefined, true);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
                console.log('⚡ Order Update:', payload);
                loadData(undefined, true);
            })
            .on('broadcast', { event: 'refresh' }, (payload) => {
                console.log('🚀 INSTANT BROADCAST RECEIVED:', payload);
                loadData(undefined, true);
            })
            .subscribe((status) => {
                console.log('📡 REALTIME STATUS:', status);
                setIsConnected(status === 'SUBSCRIBED');
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [loadData]);

    const handleCellClick = async (product: Product, clientName: string, cellData: CellData) => {
        if (!cellData || cellData.ordered === 0) return;

        const newPickedStr = window.prompt(
            `Picking: ${product.name} para ${clientName}\n\nPedido: ${cellData.ordered}\nPicado Actual: ${cellData.picked}\n\nIngresa nueva cantidad picada total:`,
            cellData.picked.toString()
        );

        if (newPickedStr === null) return;

        const newPickedTotal = parseFloat(newPickedStr);
        if (isNaN(newPickedTotal) || newPickedTotal < 0) return;

        // Optimistic UI Update
        const newMatrix = { ...matrix };
        newMatrix[product.id][clientName] = {
            ...cellData,
            picked: newPickedTotal
        };
        setMatrix(newMatrix);

        // Update Backend
        if (cellData.items.length > 0) {
            const firstItem = cellData.items[0];
            await supabase.from('order_items').update({ picked_quantity: newPickedTotal }).eq('id', firstItem.id);
        }
    };

    // Group Products by Category
    const productsByCategory = products.reduce((acc, p) => {
        if (!acc[p.category]) acc[p.category] = [];
        acc[p.category].push(p);
        return acc;
    }, {} as Record<string, Product[]>);

    const getZoneColor = (zone: string) => {
        switch (zone) {
            case 'Norte': return '#3B82F6';
            case 'Sur': return '#F97316';
            case 'Oriente': return '#A855F7';
            case 'Occidente': return '#EC4899';
            case 'Centro': return '#14B8A6';
            default: return '#333';
        }
    };

    // Helper for Short Names
    const getClientShortName = (name: string) => {
        return name.toUpperCase().replace('RESTAURANTE', '').replace('CORPORACION', '').trim();
    };

    // --- Header Grouping Logic ---
    const zoneHeaders: { name: string; count: number; color: string; percent: number }[] = [];
    let currentZone = '';
    let currentCount = 0;

    // Helper to calculate zone percent
    const getZonePercent = (zoneName: string) => {
        let total = 0;
        let picked = 0;

        // Find clients in this zone
        const zoneClients = clients.filter(c => c.zone_name === zoneName);

        zoneClients.forEach(c => {
            Object.values(matrix).forEach(prodRow => {
                const cell = prodRow[c.company_name];
                if (cell) {
                    total += cell.ordered;
                    // Cap picked at ordered to not go over 100% if over-picking happens
                    picked += Math.min(cell.ordered, cell.picked);
                }
            });
        });

        if (total === 0) return 0;
        const percent = (picked / total) * 100;
        // Use floor for everything except true 100% to avoid premature rounding
        return percent >= 100 ? 100 : Math.floor(percent);
    };

    clients.forEach((client, index) => {
        if (client.zone_name !== currentZone) {
            if (currentZone !== '') {
                zoneHeaders.push({
                    name: currentZone,
                    count: currentCount,
                    color: getZoneColor(currentZone),
                    percent: getZonePercent(currentZone)
                });
            }
            currentZone = client.zone_name;
            currentCount = 1;
        } else {
            currentCount++;
        }

        if (index === clients.length - 1) {
            zoneHeaders.push({
                name: currentZone,
                count: currentCount,
                color: getZoneColor(currentZone),
                percent: getZonePercent(currentZone)
            });
        }
    });

    // Helper for Client Completion
    const isClientComplete = useCallback((clientName: string) => {
        let hasOrders = false;
        let allItemsPicked = true;

        Object.values(matrix).forEach(prodRow => {
            const cell = prodRow[clientName];
            if (cell && cell.ordered > 0) {
                hasOrders = true;
                if (cell.picked < cell.ordered) {
                    allItemsPicked = false;
                }
            }
        });

        return hasOrders && allItemsPicked;
    }, [matrix]);

    // Helper for Category Progress
    const getCategoryPercent = (categoryName: string, products: Product[]) => {
        let total = 0;
        let picked = 0;

        products.forEach(p => {
            const prodRow = matrix[p.id];
            if (prodRow) {
                Object.values(prodRow).forEach(cell => {
                    total += cell.ordered;
                    picked += Math.min(cell.ordered, cell.picked);
                });
            }
        });

        if (total === 0) return 0;
        const percent = (picked / total) * 100;
        return percent >= 100 ? 100 : Math.floor(percent);
    };

    // --- Milestone Logic ---
    const [milestone, setMilestone] = useState<{ type: 'CLIENT' | 'ZONE', name: string } | null>(null);
    const lastCompletedClientsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (loading) return;

        const currentCompleted = new Set<string>();
        let newlyCompletedName = null;

        clients.forEach(c => {
            const isDone = isClientComplete(c.company_name);
            if (isDone) {
                currentCompleted.add(c.company_name);
                if (!lastCompletedClientsRef.current.has(c.company_name)) {
                    newlyCompletedName = c.company_name;
                }
            }
        });

        // Trigger milestone only if it's a real new completion
        // and we aren't already showing one. 
        // We check size > 0 to avoid triggering on initial load.
        if (newlyCompletedName && !milestone && lastCompletedClientsRef.current.size > 0) {
            setMilestone({ type: 'CLIENT', name: newlyCompletedName });
            setTimeout(() => setMilestone(null), 5000);
        }

        // Always sync the ref
        lastCompletedClientsRef.current = currentCompleted;
    }, [matrix, loading, clients, isClientComplete, milestone]); // Removed lastCompletedClients from deps

    // --- Global Progress Logic ---
    let totalGlobalOrdered = 0;
    let totalGlobalPicked = 0;
    let totalCompletedUnits = 0;
    let totalPartialUnits = 0;

    Object.values(matrix).forEach(prodRow => {
        Object.values(prodRow).forEach(cell => {
            totalGlobalOrdered += cell.ordered;
            totalGlobalPicked += cell.picked;

            if (cell.picked >= cell.ordered && cell.ordered > 0) {
                totalCompletedUnits += cell.picked;
            } else {
                totalPartialUnits += cell.picked;
            }
        });
    });

    const globalPercent = totalGlobalOrdered > 0
        ? Math.round((totalGlobalPicked / totalGlobalOrdered) * 100)
        : 0;

    const percentComplete = totalGlobalOrdered > 0 ? Math.round((totalCompletedUnits / totalGlobalOrdered) * 100) : 0;
    const percentPartial = totalGlobalOrdered > 0 ? Math.round((totalPartialUnits / totalGlobalOrdered) * 100) : 0;

    // Crosshair Highlighting Logic
    const clientsWithAlerts = new Set<string>();
    const productsWithAlerts = new Set<string>();

    Object.entries(matrix).forEach(([prodId, prodRow]) => {
        Object.entries(prodRow).forEach(([clientName, cell]) => {
            if (cell.hasRejection || cell.hasWarning) {
                clientsWithAlerts.add(clientName);
                productsWithAlerts.add(prodId);
            }
        });
    });

    if (loading) return <div style={{ background: '#000', color: '#fff', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', fontSize: '2rem' }}>AGUARDE...</div>;

    return (
        <main style={{ backgroundColor: '#000', minHeight: '100vh', color: '#fff', fontFamily: "Inter, system-ui, sans-serif", display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* TOP HEADER */}
            <header style={{ height: '70px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem', background: '#050505' }}>
                <div
                    onClick={() => router.push('/ops')}
                    style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: '#22C55E', fontWeight: '900', fontSize: '1.5rem', cursor: 'pointer' }}>
                    LOGISTICS PRO <span style={{ color: '#666' }}>|</span> <span style={{ color: '#fff' }}>PICKING</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '3rem' }}>
                    {/* ADVANCED PROGRESS BAR */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '600px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 'bold', color: '#aaa', textTransform: 'uppercase' }}>
                            <span>PRODUCCIÓN</span>
                            <span>{totalGlobalPicked} / {totalGlobalOrdered} Und</span>
                        </div>
                        {/* THE BAR */}
                        <div style={{ width: '100%', height: '12px', background: '#222', borderRadius: '6px', overflow: 'hidden', display: 'flex' }}>
                            {/* COMPLETED SEGMENT */}
                            <div style={{
                                width: `${percentComplete}%`,
                                background: '#22C55E', // Green
                                height: '100%',
                                transition: 'width 0.5s'
                            }} title={`Terminado: ${percentComplete}%`}></div>

                            {/* PARTIAL SEGMENT */}
                            <div style={{
                                width: `${percentPartial}%`,
                                background: '#EAB308', // Yellow
                                height: '100%',
                                transition: 'width 0.5s'
                            }} title={`Parcial: ${percentPartial}%`}></div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: '600' }}>
                            <span style={{ color: '#22C55E' }}>⬤ {percentComplete}% OK</span>
                            <span style={{ color: '#EAB308' }}>⬤ {percentPartial}% PARCIAL</span>
                        </div>
                    </div>

                    {/* GLOBAL PROGRESS */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: '#888', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>TOTAL</span>
                        <div style={{
                            fontSize: '2rem',
                            fontWeight: 'bold',
                            color: globalPercent === 100 ? '#4ADE80' : '#FACC15',
                            textShadow: '0 0 10px rgba(250, 204, 21, 0.3)'
                        }}>
                            {globalPercent}%
                        </div>
                    </div>

                    {/* CLOCK & STATUS */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                         {/* Connection Status */}
                        <div style={{
                            padding: '5px 10px', borderRadius: '20px',
                            background: isConnected ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.2)',
                            border: isConnected ? '1px solid #22C55E' : '1px solid #EF4444',
                            display: 'flex', alignItems: 'center', gap: '8px'
                        }}>
                            <div style={{
                                width: '10px', height: '10px', borderRadius: '50%',
                                background: isConnected ? '#22C55E' : '#EF4444',
                                boxShadow: isConnected ? '0 0 10px #22C55E' : '0 0 10px #EF4444',
                                animation: !isConnected ? 'pulseAlert 1s infinite' : 'none'
                            }}></div>
                            {!isConnected && <span style={{ fontSize: '0.7rem', color: '#EF4444', fontWeight: 'bold' }}>DESCONECTADO</span>}
                        </div>

                        <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{currentTime}</div>
                    </div>
                </div>
            </header>

            {/* SCROLLABLE GRID */}
            <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
                <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content' }}>
                    <thead>
                        {/* ROW 1: ZONES (Sticky Top) */}
                        <tr>
                            <th style={{
                                position: 'sticky', top: 0, left: 0, zIndex: 40,
                                background: '#000', minWidth: '200px',
                                borderBottom: '1px solid #333', borderRight: '1px solid #333',
                                height: '40px'
                            }}></th>

                            {zoneHeaders.map((zone, i) => (
                                <th key={i} colSpan={zone.count} style={{
                                    position: 'sticky', top: 0, zIndex: 30,
                                    background: '#0a0a0a',
                                    color: zone.percent === 100 ? '#22C55E' : zone.color,
                                    borderBottom: `4px solid ${zone.percent === 100 ? '#22C55E' : zone.color}`,
                                    borderRight: '1px solid #333',
                                    textAlign: 'center',
                                    fontWeight: 'bold',
                                    fontSize: '1rem',
                                    padding: '0.5rem 0'
                                }}>
                                    {zone.name.toUpperCase()} <span style={{ color: '#fff', opacity: 0.7, marginLeft: '5px' }}>{zone.percent}%</span>
                                </th>
                            ))}
                        </tr>

                        {/* ROW 2: CLIENT NAMES (Vertical) */}
                        <tr>
                            <th style={{
                                position: 'sticky', top: '44px', left: 0, zIndex: 40,
                                background: '#000',
                                borderBottom: '1px solid #333', borderRight: '1px solid #333',
                                color: '#888', textAlign: 'right', padding: '1rem'
                            }}>PRODUCTO</th>

                            {clients.map((client, index) => {
                                const complete = isClientComplete(client.company_name);
                                return (
                                    <th key={client.id} style={{
                                        position: 'sticky', top: '44px', zIndex: 20,
                                        background: complete ? '#064E3B' : (clientsWithAlerts.has(client.company_name) ? '#7F1D1D' : '#000'),
                                        borderBottom: '1px solid #333',
                                        borderRight: '1px solid #111',
                                        height: '90px',
                                        verticalAlign: 'top',
                                        padding: '0',
                                        minWidth: '40px',
                                        maxWidth: '40px',
                                        overflow: 'hidden',
                                        animation: clientsWithAlerts.has(client.company_name) ? 'pulseAlert 1.5s infinite' : 'none'
                                    }}>
                                        <div style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            height: '90px', // Explicit height matching th
                                            alignItems: 'center',
                                            justifyContent: 'flex-start',
                                            overflow: 'hidden'
                                        }}>
                                            {/* Big Lane Number */}
                                            <div style={{
                                                fontSize: '1.3rem', // Slightly smaller to fit
                                                fontWeight: '800',
                                                color: complete ? '#4ADE80' : '#fff',
                                                marginBottom: '2px', // Tighter spacing
                                                borderBottom: '1px solid #333',
                                                width: '100%',
                                                textAlign: 'center',
                                                paddingTop: '4px',
                                                paddingBottom: '2px',
                                                flexShrink: 0,
                                                letterSpacing: '-1px'
                                            }}>
                                                {index + 1}
                                            </div>

                                            {/* Vertical Name */}
                                            <div style={{
                                                writingMode: 'vertical-rl',
                                                transform: 'rotate(180deg)',
                                                whiteSpace: 'nowrap',
                                                fontSize: '0.75rem', 
                                                fontWeight: '800',
                                                letterSpacing: '0.5px',
                                                color: complete ? '#86EFAC' : '#fff',
                                                textAlign: 'left',
                                                width: '100%',
                                                flex: 1,
                                                overflow: 'hidden',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'flex-end',
                                                paddingBottom: '8px'
                                            }}>
                                                {getClientShortName(client.company_name)}
                                            </div>
                                        </div>
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>

                    <tbody>
                        {Object.entries(productsByCategory).map(([category, categoryProducts]) => {
                            const catPercent = getCategoryPercent(category, categoryProducts);
                            const isCatComplete = catPercent === 100;

                            return (
                                <Fragment key={category}>
                                    {/* Category Header */}
                                    <tr>
                                        <td colSpan={clients.length + 1} style={{
                                            background: '#111', color: '#888',
                                            fontWeight: 'bold', fontSize: '1.1rem', // Bigger font size
                                            padding: '0.4rem 1rem', borderBottom: '1px solid #222',
                                            position: 'sticky', left: 0 // Optional: Sticky category header? Maybe too much.
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '20px' }}>
                                                <span style={{ minWidth: '250px', display: 'inline-block' }}>{category.toUpperCase()}</span>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    {/* Mini Progress Bar Background */}
                                                    <div style={{ width: '100px', height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden' }}>
                                                        <div style={{
                                                            width: `${catPercent}%`,
                                                            height: '100%',
                                                            background: isCatComplete ? '#4ADE80' : '#FACC15',
                                                            transition: 'width 0.5s ease'
                                                        }} />
                                                    </div>

                                                    <span style={{
                                                        color: catPercent === 0 ? '#fff' : (isCatComplete ? '#4ADE80' : '#FACC15'),
                                                        fontWeight: 'bold',
                                                        minWidth: '35px', textAlign: 'right',
                                                        fontSize: '0.9rem'
                                                    }}>
                                                        {catPercent}%
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>

                                    {categoryProducts.map(product => {
                                        // Filter out products that have NO orders at all in visible clients
                                        const rowHasData = clients.some(c => matrix[product.id]?.[c.company_name]);
                                        if (!rowHasData) return null;

                                        return (
                                            <tr key={product.id}>
                                                {/* Product Name (Sticky Left) */}
                                                <td style={{
                                                    position: 'sticky', left: 0, zIndex: 10,
                                                    background: productsWithAlerts.has(product.id) ? '#7F1D1D' : '#000',
                                                    borderRight: '1px solid #333', borderBottom: '1px solid #222',
                                                    padding: '0.5rem 1rem',
                                                    color: productsWithAlerts.has(product.id) ? '#fff' : '#ddd', 
                                                    fontSize: '0.9rem',
                                                    minWidth: '200px', maxWidth: '300px',
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    animation: productsWithAlerts.has(product.id) ? 'pulseAlert 2s infinite' : 'none'
                                                }} title={product.name}>
                                                    {product.name}
                                                    <span style={{ marginLeft: '8px', fontSize: '0.7rem', color: '#555' }}>
                                                        {product.unit_of_measure}
                                                    </span>
                                                </td>

                                                {/* Matrix Cells */}
                                                {clients.map(client => {
                                                    const cell = matrix[product.id]?.[client.company_name];

                                                    if (!cell) {
                                                        return <td key={client.id} style={{ background: '#050505', borderBottom: '1px solid #111', borderRight: '1px solid #111' }}></td>;
                                                    }

                                                    // State Logic
                                                    let bg = '#111';
                                                    let fg = '#444';
                                                    if (cell.picked > 0) { bg = '#331B00'; fg = '#F59E0B'; } // Picking
                                                    if (cell.picked >= cell.ordered) { bg = '#062C10'; fg = '#10B981'; } // Ready

                                                    // REJECTION & WARNING OVERRIDES (Contundentes)
                                                    if (cell.hasRejection) {
                                                        bg = '#EF4444'; 
                                                        fg = '#fff';
                                                    } else if (cell.hasWarning) {
                                                        bg = '#EAB308';
                                                        fg = '#000';
                                                    }

                                                    // If just ordered but not picked
                                                    if (cell.ordered > 0 && cell.picked === 0) {
                                                        bg = '#222';
                                                        fg = '#fff';
                                                    }

                                                    // Partial Display Logic
                                                    const isPartial = cell.picked > 0 && cell.picked < cell.ordered;

                                                    return (
                                                        <td key={client.id}
                                                            onClick={() => handleCellClick(product, client.company_name, cell)}
                                                            style={{
                                                                background: bg, color: fg,
                                                                borderBottom: '1px solid #000', borderRight: '1px solid #000',
                                                                textAlign: 'center', fontWeight: 'bold',
                                                                fontSize: '1rem',
                                                                cursor: 'pointer', transition: 'all 0.1s',
                                                                animation: cell.hasRejection ? 'pulseAlert 1s infinite' : (cell.hasWarning ? 'pulseWarning 1.5s infinite' : 'none'),
                                                                boxShadow: (cell.hasRejection || cell.hasWarning) ? 'inset 0 0 15px rgba(0,0,0,0.5)' : 'none',
                                                                position: 'relative',
                                                                zIndex: (cell.hasRejection || cell.hasWarning) ? 5 : 1
                                                            }}
                                                        >
                                                            {cell.hasRejection ? (
                                                                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1', alignItems: 'center' }}>
                                                                    <span style={{ fontSize: '1.2rem' }}>🚨</span>
                                                                    <span style={{ fontSize: '0.7rem' }}> RECHAZO</span>
                                                                </div>
                                                            ) : cell.hasWarning ? (
                                                                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1', alignItems: 'center' }}>
                                                                    <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                                                                    <span style={{ fontSize: '0.7rem' }}> VERIF</span>
                                                                </div>
                                                            ) : isPartial ? (
                                                                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1' }}>
                                                                    <span style={{ color: '#fff', fontSize: '1rem' }}>{cell.picked}</span>
                                                                    <span style={{ fontSize: '0.7rem', opacity: 0.8, borderTop: '1px solid #555' }}>{cell.ordered}</span>
                                                                </div>
                                                            ) : (
                                                                cell.ordered
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Footer Ticker */}
            <div className="bg-yellow-500 text-black p-1 font-bold text-sm overflow-hidden whitespace-nowrap z-50">
                <div className="animate-marquee inline-block">
                    *** SEGUIMIENTO EN VIVO *** OPERACIÓN FLUIDA *** RUTAS NORTE: CIERRE 14:00 *** REPORTE NOVEDADES AL SUPERVISOR ***
                </div>
            </div>

            <style jsx>{`
                .animate-marquee {
                    animation: marquee 30s linear infinite;
                }
                @keyframes marquee {
                    0% { transform: translateX(100%); }
                    100% { transform: translateX(-100%); }
                }
                @keyframes popIn {
                    0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
                    80% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
                    100% { transform: translate(-50%, -50%) scale(1); }
                }
                @keyframes pulseAlert {
                    0% { background-color: #EF4444; }
                    50% { background-color: #7F1D1D; }
                    100% { background-color: #EF4444; }
                }
                @keyframes pulseWarning {
                    0% { background-color: #EAB308; }
                    50% { background-color: #78350F; }
                    100% { background-color: #EAB308; }
                }
            `}</style>

            {/* MILESTONE POPUP */}
            {milestone && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    background: 'rgba(5, 46, 22, 0.95)', border: '4px solid #4ADE80',
                    padding: '2rem 4rem', borderRadius: '20px', zIndex: 100,
                    textAlign: 'center', boxShadow: '0 0 50px rgba(74, 222, 128, 0.5)',
                    animation: 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                }}>
                    <div style={{ fontSize: '1.5rem', color: '#fff', marginBottom: '10px' }}>
                        {milestone.type === 'CLIENT' ? 'PEDIDO COMPLETADO' : 'ZONA LISTA'}
                    </div>
                    <div style={{ fontSize: '3rem', fontWeight: '900', color: '#4ADE80', textTransform: 'uppercase' }}>
                        {milestone.name}
                    </div>
                    <div style={{ fontSize: '5rem', lineHeight: '1' }}>🎉</div>
                </div>
            )}
        </main>
    );
}
