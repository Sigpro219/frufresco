'use client';

import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { isAbortError } from '@/lib/errorUtils';
import { Clock, Wifi, Package, ArrowLeft, AlertCircle, RefreshCw, Monitor, LayoutGrid, Tv } from 'lucide-react';

// Types
type Product = {
    id: string;
    name: string;
    buying_team?: string | null;
    unit_of_measure: string;
    min_inventory_level?: number;
    current_stock?: number;
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

function formatLifoSpaces(spaces: number[]): string {
    if (spaces.length === 0) return 'ESP -';
    const uniqueSpaces = Array.from(new Set(spaces)).sort((a, b) => a - b);
    if (uniqueSpaces.length === 1) return `ESP ${uniqueSpaces[0]}`;
    // Check if contiguous
    const isContiguous = uniqueSpaces.every((val, i) => i === 0 || val === uniqueSpaces[i - 1] + 1);
    if (isContiguous) {
        return `ESP ${uniqueSpaces[0]}-${uniqueSpaces[uniqueSpaces.length - 1]}`;
    } else {
        return `ESP ${uniqueSpaces.join(', ')}`;
    }
}

export default function PickingDashboard() {
    const router = useRouter();
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    // STATE
    const [density, setDensity] = useState<'standard' | 'high' | 'tv'>('standard');

    useEffect(() => {
        const saved = localStorage.getItem('picking_dashboard_density');
        if (saved && (saved === 'standard' || saved === 'high' || saved === 'tv')) {
            setDensity(saved);
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('picking-density-changed', { detail: saved }));
            }, 100);
        }
    }, []);

    const changeDensity = (val: 'standard' | 'high' | 'tv') => {
        setDensity(val);
        localStorage.setItem('picking_dashboard_density', val);
        window.dispatchEvent(new CustomEvent('picking-density-changed', { detail: val }));
    };

    const DENSITY_CONFIG = {
        standard: {
            cellWidth: '50px',
            cellHeight: '50px',
            fontSize: '0.95rem',
            clientFontSize: '0.7rem',
            productFontSize: '0.85rem',
            clientHeaderHeight: '100px',
            productColWidth: '220px',
            productColMaxWidth: '300px'
        },
        high: {
            cellWidth: '40px',
            cellHeight: '40px',
            fontSize: '0.85rem',
            clientFontSize: '0.6rem',
            productFontSize: '0.75rem',
            clientHeaderHeight: '85px',
            productColWidth: '180px',
            productColMaxWidth: '240px'
        },
        tv: {
            cellWidth: '32px',
            cellHeight: '32px',
            fontSize: '0.75rem',
            clientFontSize: '0.55rem',
            productFontSize: '0.7rem',
            clientHeaderHeight: '75px',
            productColWidth: '150px',
            productColMaxWidth: '200px'
        }
    };

    const cfg = DENSITY_CONFIG[density];

    const [matrix, setMatrix] = useState<Record<string, Record<string, CellData>>>({});
    const [clients, setClients] = useState<{ id: string, company_name: string, zone_name: string }[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [clientSpaces, setClientSpaces] = useState<Record<string, string>>({});
    const [logisticParameters, setLogisticParameters] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [shortName, setShortName] = useState('FRUFRESCO');

    useEffect(() => {
        supabase
            .from('app_settings')
            .select('key, value')
            .in('key', ['app_logosymbol_url', 'app_short_name'])
            .then(({ data, error }) => {
                if (!error && data) {
                    const logo = data.find(s => s.key === 'app_logosymbol_url')?.value;
                    if (logo) setLogoUrl(logo);
                    const name = data.find(s => s.key === 'app_short_name')?.value;
                    if (name) setShortName(name.toUpperCase());
                }
            });
    }, []);

    useEffect(() => {
        // Hydration fix for time
        setCurrentTime(new Date().toLocaleTimeString());
        const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
        return () => clearInterval(timer);
    }, []);

    const loadData = useCallback(async (signal?: AbortSignal, silent = false) => {
        if (!silent) setLoading(true);
        try {
            // 1. Fetch Active Orders
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

            const activeClientNames = Array.from(new Set((orders || []).map(o => (o as any).customer_name).filter((n): n is string => !!n))) as string[];

            // 2. Fetch Profiles to get zones
            const { data: profiles } = await supabase.from('profiles')
                .select('id, company_name, delivery_zone_id')
                .eq('role', 'b2b_client')
                .abortSignal(signal as any) as { data: { id: string; company_name: string; delivery_zone_id: string }[] | null };
            
            const profileMap = new Map((profiles || []).map(p => [p.company_name, p]));

            // Fetch Zones for Mapping
            const { data: zones } = await supabase.from('delivery_zones').select('id, name').abortSignal(signal as any) as { data: { id: string; name: string }[] | null };
            const zoneMap = new Map((zones || []).map(z => [z.id, z.name]));

            // Fetch logistic parameters and route stops
            const { data: dbParams } = await supabase.from('logistic_parameters').select('*');
            if (dbParams && isMounted.current) {
                setLogisticParameters(dbParams);
            }

            const { data: routeStops } = await supabase.from('route_stops').select('route_id, order_id, sequence_number') as { data: { route_id: string; order_id: string; sequence_number: number }[] | null };

            // Calculate LIFO space per order_id
            const stopsByRoute: Record<string, { order_id: string, sequence_number: number }[]> = {};
            (routeStops || []).forEach(stop => {
                if (!stop.route_id || !stop.order_id) return;
                if (!stopsByRoute[stop.route_id]) {
                    stopsByRoute[stop.route_id] = [];
                }
                stopsByRoute[stop.route_id].push({
                    order_id: stop.order_id,
                    sequence_number: stop.sequence_number || 0
                });
            });

            const orderToSpaceMap: Record<string, number> = {};
            Object.values(stopsByRoute).forEach(stops => {
                // Sort route stops in reverse sequence (descending) per route
                stops.sort((a, b) => b.sequence_number - a.sequence_number);
                stops.forEach((stop, idx) => {
                    orderToSpaceMap[stop.order_id] = idx + 1;
                });
            });

            // Build clients from ORDERS (Source of Truth)
            const formattedClients = activeClientNames
                .map(name => {
                    const profile = profileMap.get(name) as any;
                    const zoneName = (profile ? zoneMap.get(profile.delivery_zone_id) : null) || 'GENERAL';
                    return {
                        id: (profile?.id || name) as string,
                        company_name: name as string,
                        zone_name: zoneName as string
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

            // Build LIFO spaces for each client
            const formattedClientSpaces: Record<string, string> = {};
            formattedClients.forEach(client => {
                const clientOrders = (orders || []).filter(o => o.customer_name === client.company_name);
                const spaces = clientOrders
                    .map(o => orderToSpaceMap[o.id])
                    .filter((s): s is number => typeof s === 'number');
                formattedClientSpaces[client.company_name] = formatLifoSpaces(spaces);
            });
            if (isMounted.current) setClientSpaces(formattedClientSpaces);

            // 3. Fetch Products with Stock Info - Group and Order by 'buying_team'
            const { data: prods } = await supabase
                .from('products')
                .select(`
                    id, name, buying_team, unit_of_measure, min_inventory_level,
                    inventory_stocks (quantity, status)
                `)
                .order('buying_team')
                .order('name')
                .abortSignal(signal as any);
            
            const processedProds = (prods || []).map((p: any) => {
                const currentStock = (p.inventory_stocks as any[])
                    ?.filter(s => s.status === 'available')
                    .reduce((sum, s) => sum + (Number(s.quantity) || 0), 0) || 0;
                
                return {
                    ...p,
                    current_stock: currentStock
                };
            });
                
            if (isMounted.current) setProducts(processedProds as Product[]);

            // 4. Build Matrix
            const newMatrix: Record<string, Record<string, CellData>> = {};
            if (orders) {
                orders.forEach(order => {
                    const clientName = order.customer_name;
                    if (order.order_items) {
                        order.order_items.forEach((item: { product_id: string, quantity: number, picked_quantity: number, quality_status?: string | null, id: string }) => {
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

    // Group Products by Buying Team
    const productsByBuyingTeam = products.reduce((acc, p) => {
        const team = p.buying_team || 'SIN ASIGNAR';
        if (!acc[team]) acc[team] = [];
        acc[team].push(p);
        return acc;
    }, {} as Record<string, Product[]>);

    const getZoneColor = (zone: string) => {
        switch (zone) {
            case 'Norte': return '#3B82F6';
            case 'Sur': return '#F97316';
            case 'Oriente': return '#A855F7';
            case 'Occidente': return '#EC4899';
            case 'Centro': return '#14B8A6';
            default: return '#64748B';
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

        const zoneClients = clients.filter(c => c.zone_name === zoneName);

        zoneClients.forEach(c => {
            Object.values(matrix).forEach(prodRow => {
                const cell = prodRow[c.company_name];
                if (cell) {
                    total += cell.ordered;
                    picked += Math.min(cell.ordered, cell.picked);
                }
            });
        });

        if (total === 0) return 0;
        const percent = (picked / total) * 100;
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

    // Helper for Buying Team Progress
    const getBuyingTeamPercent = (teamName: string, teamProducts: Product[]) => {
        let total = 0;
        let picked = 0;

        teamProducts.forEach(p => {
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

        if (newlyCompletedName && !milestone && lastCompletedClientsRef.current.size > 0) {
            setMilestone({ type: 'CLIENT', name: newlyCompletedName });
            setTimeout(() => setMilestone(null), 5000);
        }

        lastCompletedClientsRef.current = currentCompleted;
    }, [matrix, loading, clients, isClientComplete, milestone]);

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

    if (loading) {
        return (
            <div style={{
                background: '#020617',
                color: '#94A3B8',
                height: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Outfit, sans-serif',
                gap: '1rem'
            }}>
                <RefreshCw className="animate-spin text-emerald-500" size={40} />
                <span style={{ fontSize: '1.2rem', fontWeight: '600', letterSpacing: '0.05em' }}>CARGANDO CONTROL DE PICKING...</span>
            </div>
        );
    }

    // Inventory Alerts Calculation
    const inventoryAlerts = products
        .filter(p => (p.min_inventory_level || 0) > 0 && (p.current_stock || 0) < (p.min_inventory_level || 0))
        .map(p => ({
            name: p.name,
            current: p.current_stock || 0,
            min: p.min_inventory_level || 0
        }));

    return (
        <main style={{
            backgroundColor: '#020617',
            minHeight: '100vh',
            color: '#F8FAFC',
            fontFamily: "'Inter', sans-serif",
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

            {/* TOP HEADER */}
            <header style={{
                height: density === 'tv' ? '55px' : '75px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: density === 'tv' ? '0 0.75rem' : '0 2rem',
                background: 'rgba(15, 23, 42, 0.6)',
                backdropFilter: 'blur(12px)',
                zIndex: 50
            }}>
                <div
                    onClick={() => router.push('/ops')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        color: '#10B981',
                        fontWeight: '800',
                        fontSize: density === 'tv' ? '1.1rem' : '1.3rem',
                        cursor: 'pointer',
                        fontFamily: 'Outfit, sans-serif'
                    }}
                >
                    <div style={{
                        backgroundColor: 'white',
                        width: density === 'tv' ? '24px' : '32px',
                        height: density === 'tv' ? '24px' : '32px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 10px rgba(255,255,255,0.1)',
                        padding: '3px',
                        flexShrink: 0
                    }}>
                        <img 
                            src={logoUrl || "/logosimbolo.png"} 
                            alt={shortName} 
                            style={{ height: '100%', width: 'auto', objectFit: 'contain' }} 
                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/logosimbolo.png"; }}
                        />
                    </div>
                    <span style={{ color: '#fff' }}>
                        {shortName} <span style={{ color: 'var(--ops-primary)' }}>OPS</span>
                    </span>
                    {density !== 'tv' && (
                        <>
                            <span style={{ color: 'rgba(255, 255, 255, 0.15)', marginLeft: '4px' }}>|</span>
                            <span style={{ color: '#94A3B8', fontWeight: '500', fontSize: '1rem', marginLeft: '4px' }}>TABLERO DE PICKING</span>
                        </>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: density === 'tv' ? '1rem' : '2.5rem' }}>
                    {/* ADVANCED PROGRESS BAR */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: density === 'tv' ? '240px' : '400px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 'bold', color: '#94A3B8', textTransform: 'uppercase', fontFamily: 'Outfit, sans-serif' }}>
                            <span>PRODUCCIÓN DE ALISTAMIENTO</span>
                            <span>{totalGlobalPicked} / {totalGlobalOrdered} Und</span>
                        </div>
                        <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '5px', overflow: 'hidden', display: 'flex', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{
                                width: `${percentComplete}%`,
                                background: '#10B981',
                                height: '100%',
                                transition: 'width 0.5s ease'
                            }} title={`Terminado: ${percentComplete}%`}></div>

                            <div style={{
                                width: `${percentPartial}%`,
                                background: '#F59E0B',
                                height: '100%',
                                transition: 'width 0.5s ease'
                            }} title={`Parcial: ${percentPartial}%`}></div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: '600', fontFamily: 'Inter, sans-serif' }}>
                            <span style={{ color: '#10B981' }}>⬤ {percentComplete}% COMPLETADO</span>
                            <span style={{ color: '#F59E0B' }}>⬤ {percentPartial}% EN PROCESO</span>
                        </div>
                    </div>

                    {/* GLOBAL PROGRESS */}
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '10px',
                        minWidth: density === 'tv' ? '100px' : '130px',
                        justifyContent: 'flex-end'
                    }}>
                        <span style={{ color: '#94A3B8', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'Outfit, sans-serif' }}>TOTAL</span>
                        <div style={{
                            fontSize: '2rem',
                            fontWeight: 'bold',
                            color: globalPercent === 100 ? '#10B981' : '#F59E0B',
                            textShadow: '0 0 15px rgba(245, 158, 11, 0.2)',
                            fontFamily: 'Outfit, sans-serif',
                            fontVariantNumeric: 'tabular-nums',
                            minWidth: density === 'tv' ? '50px' : '65px',
                            textAlign: 'right'
                        }}>
                            {globalPercent}%
                        </div>
                    </div>

                    {/* DENSITY SELECTOR */}
                    <div style={{ 
                        display: 'flex', 
                        background: 'rgba(15, 23, 42, 0.8)', 
                        padding: '3px', 
                        borderRadius: '8px', 
                        border: '1px solid rgba(255,255,255,0.08)',
                        marginRight: '5px',
                        gap: '2px'
                    }}>
                        <button 
                            onClick={() => changeDensity('standard')}
                            style={{
                                padding: '6px 10px', 
                                borderRadius: '6px', 
                                border: 'none', 
                                cursor: 'pointer',
                                background: density === 'standard' ? '#10B981' : 'transparent',
                                color: density === 'standard' ? '#020617' : '#94A3B8',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.75rem',
                                fontWeight: '700',
                                transition: 'all 0.2s'
                            }} 
                            title="Estándar (PC)"
                        >
                            <Monitor size={13} strokeWidth={2.5} />
                            <span>PC Standard</span>
                        </button>
                        <button 
                            onClick={() => changeDensity('high')}
                            style={{
                                padding: '6px 10px', 
                                borderRadius: '6px', 
                                border: 'none', 
                                cursor: 'pointer',
                                background: density === 'high' ? '#10B981' : 'transparent',
                                color: density === 'high' ? '#020617' : '#94A3B8',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.75rem',
                                fontWeight: '700',
                                transition: 'all 0.2s'
                            }} 
                            title="Alta Densidad (PC)"
                        >
                            <LayoutGrid size={13} strokeWidth={2.5} />
                            <span>PC Compact</span>
                        </button>
                        <button 
                            onClick={() => changeDensity('tv')}
                            style={{
                                padding: '6px 10px', 
                                borderRadius: '6px', 
                                border: 'none', 
                                cursor: 'pointer',
                                background: density === 'tv' ? '#10B981' : 'transparent',
                                color: density === 'tv' ? '#020617' : '#94A3B8',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.75rem',
                                fontWeight: '700',
                                transition: 'all 0.2s'
                            }} 
                            title="Televisor (TV)"
                        >
                            <Tv size={13} strokeWidth={2.5} />
                            <span>TV</span>
                        </button>
                    </div>

                    {/* CLOCK & STATUS */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{
                            padding: '5px 10px', borderRadius: '20px',
                            background: isConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            border: isConnected ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                            display: 'flex', alignItems: 'center', gap: '8px'
                        }}>
                            <Wifi size={14} className={isConnected ? "text-emerald-500" : "text-red-500"} />
                            <span style={{ fontSize: '0.7rem', color: isConnected ? '#10B981' : '#EF4444', fontWeight: 'bold' }}>
                                {isConnected ? 'LIVE' : 'DISCONNECTED'}
                            </span>
                        </div>

                        <div style={{ 
                            fontSize: density === 'tv' ? '1.1rem' : '1.4rem', 
                            fontWeight: 'bold', 
                            fontFamily: 'Outfit, sans-serif', 
                            color: '#E2E8F0',
                            fontVariantNumeric: 'tabular-nums',
                            minWidth: density === 'tv' ? '85px' : '110px',
                            textAlign: 'right'
                        }}>{currentTime}</div>
                    </div>
                </div>
            </header>

            {/* INVENTORY ALERT BANNER */}
            {inventoryAlerts && inventoryAlerts.length > 0 && (
                <div style={{ 
                    backgroundColor: 'rgba(251, 191, 36, 0.1)', 
                    color: '#FBBF24', 
                    padding: '0.6rem 2rem', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '1rem',
                    borderBottom: '1px solid rgba(251, 191, 36, 0.2)',
                    zIndex: 40,
                    fontWeight: '600',
                    fontSize: '0.9rem',
                    overflow: 'hidden'
                }}>
                    <AlertCircle className="text-amber-500" size={18} />
                    <div style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        <div style={{ 
                            display: 'inline-block', 
                            animation: inventoryAlerts.length > 2 ? 'marqueeAlert 30s linear infinite' : 'none',
                            paddingLeft: '100%'
                        }}>
                            <span style={{ marginRight: '2rem', color: '#FBBF24', fontWeight: 'bold' }}>REVISAR STOCK DE SEGURIDAD EN ALMACÉN:</span>
                            {inventoryAlerts.map((alert, idx) => (
                                <span key={idx} style={{ marginRight: '3rem' }}>
                                    {alert.name} (Actual: {alert.current} | Min: {alert.min})
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* SCROLLABLE GRID */}
            <div style={{ flex: 1, overflow: 'auto', position: 'relative', background: '#090d16' }}>
                <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content' }}>
                    <thead>
                        {/* ROW 1: ZONES (Sticky Top) */}
                        <tr>
                            <th style={{
                                position: 'sticky', top: 0, left: 0, zIndex: 40,
                                background: '#090d16', minWidth: '220px',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                                height: '45px'
                            }}></th>

                            {zoneHeaders.map((zone, i) => (
                                <th key={i} colSpan={zone.count} style={{
                                    position: 'sticky', top: 0, zIndex: 30,
                                    background: 'rgba(15, 23, 42, 0.9)',
                                    color: zone.percent === 100 ? '#10B981' : zone.color,
                                    borderBottom: `3px solid ${zone.percent === 100 ? '#10B981' : zone.color}`,
                                    borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                                    textAlign: 'center',
                                    fontWeight: 'bold',
                                    fontSize: '0.9rem',
                                    padding: '0.5rem 0',
                                    fontFamily: 'Outfit, sans-serif',
                                    backdropFilter: 'blur(8px)'
                                }}>
                                    {zone.name.toUpperCase()} <span style={{ color: '#fff', opacity: 0.7, marginLeft: '5px' }}>{zone.percent}%</span>
                                </th>
                            ))}
                        </tr>

                        {/* ROW 2: CLIENT NAMES (Vertical) */}
                        <tr>
                            <th style={{
                                position: 'sticky', top: '45px', left: 0, zIndex: 40,
                                background: '#090d16',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                                color: '#64748B', textAlign: 'right', padding: '1rem',
                                fontFamily: 'Outfit, sans-serif', fontSize: '0.85rem'
                            }}>PRODUCTO</th>

                            {clients.map((client) => {
                                const complete = isClientComplete(client.company_name);
                                return (
                                    <th key={client.id} style={{
                                        position: 'sticky', top: '45px', zIndex: 20,
                                        background: complete ? 'rgba(16, 185, 129, 0.15)' : 'rgba(15, 23, 42, 0.95)',
                                        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                                        borderRight: '1px solid rgba(255, 255, 255, 0.05)',
                                        height: cfg.clientHeaderHeight,
                                        verticalAlign: 'top',
                                        padding: '0',
                                        minWidth: cfg.cellWidth,
                                        maxWidth: cfg.cellWidth,
                                        overflow: 'hidden',
                                        backdropFilter: 'blur(8px)',
                                        transition: 'background-color 0.2s ease'
                                    }}>
                                        <div style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            height: cfg.clientHeaderHeight,
                                            alignItems: 'center',
                                            justifyContent: 'flex-start',
                                            overflow: 'hidden'
                                        }}>
                                            {/* LIFO Space Label instead of Index */}
                                            <div style={{
                                                fontSize: cfg.clientFontSize,
                                                fontWeight: '700',
                                                color: complete ? '#10B981' : '#38BDF8',
                                                marginBottom: '4px',
                                                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                                                width: '100%',
                                                textAlign: 'center',
                                                paddingTop: '6px',
                                                paddingBottom: '4px',
                                                flexShrink: 0,
                                                fontFamily: 'Outfit, sans-serif',
                                                letterSpacing: '0.5px'
                                            }}>
                                                {clientSpaces[client.company_name] || 'ESP -'}
                                            </div>
 
                                            {/* Vertical Name */}
                                            <div style={{
                                                writingMode: 'vertical-rl',
                                                transform: 'rotate(180deg)',
                                                whiteSpace: 'nowrap',
                                                fontSize: cfg.clientFontSize, 
                                                fontWeight: '600',
                                                letterSpacing: '0.5px',
                                                color: complete ? '#A7F3D0' : '#E2E8F0',
                                                textAlign: 'left',
                                                width: '100%',
                                                flex: 1,
                                                overflow: 'hidden',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'flex-end',
                                                paddingBottom: '8px',
                                                fontFamily: 'Inter, sans-serif'
                                            }}>
                                                {getClientShortName(client.company_name)}
                                            </div>
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>

                    <tbody>
                        {Object.entries(productsByBuyingTeam).map(([team, teamProducts]) => {
                            const teamPercent = getBuyingTeamPercent(team, teamProducts);
                            const isTeamComplete = teamPercent === 100;

                            return (
                                <Fragment key={team}>
                                    {/* Buying Team Section Header */}
                                    <tr>
                                        <td colSpan={clients.length + 1} style={{
                                            background: 'rgba(15, 23, 42, 0.8)', color: '#94a3b8',
                                            fontWeight: 'bold', fontSize: '1.1rem',
                                            padding: '0.6rem 1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                                            position: 'sticky', left: 0,
                                            backdropFilter: 'blur(8px)',
                                            zIndex: 5
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '20px' }}>
                                                <span style={{ minWidth: '250px', display: 'inline-block', fontFamily: 'Outfit, sans-serif', letterSpacing: '0.5px' }}>{team.toUpperCase()}</span>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <div style={{ width: '100px', height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                                                        <div style={{
                                                            width: `${teamPercent}%`,
                                                            height: '100%',
                                                            background: isTeamComplete ? '#10B981' : '#F59E0B',
                                                            transition: 'width 0.5s ease'
                                                        }} />
                                                    </div>

                                                    <span style={{
                                                        color: teamPercent === 0 ? '#64748b' : (isTeamComplete ? '#10B981' : '#F59E0B'),
                                                        fontWeight: 'bold',
                                                        minWidth: '35px', textAlign: 'right',
                                                        fontSize: '0.9rem',
                                                        fontFamily: 'Inter, sans-serif'
                                                    }}>
                                                        {teamPercent}%
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>

                                    {teamProducts.map(product => {
                                        const rowHasData = clients.some(c => matrix[product.id]?.[c.company_name]);
                                        if (!rowHasData) return null;

                                        return (
                                            <tr key={product.id}>
                                                {/* Product Name (Sticky Left) */}
                                                <td style={{
                                                    position: 'sticky', left: 0, zIndex: 10,
                                                    background: '#090d16',
                                                    borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                                                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                                    padding: density === 'tv' ? '0.2rem 0.5rem' : '0.6rem 1rem',
                                                    color: '#E2E8F0', 
                                                    fontSize: cfg.productFontSize,
                                                    minWidth: cfg.productColWidth, maxWidth: cfg.productColMaxWidth,
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    fontFamily: 'Outfit, sans-serif'
                                                }} title={product.name}>
                                                    {product.name}
                                                    <span style={{ marginLeft: '8px', fontSize: cfg.clientFontSize, color: '#64748B', fontFamily: 'Inter, sans-serif' }}>
                                                        {product.unit_of_measure}
                                                    </span>
                                                </td>

                                                {/* Matrix Cells */}
                                                {clients.map(client => {
                                                    const cell = matrix[product.id]?.[client.company_name];

                                                    if (!cell) {
                                                        return <td key={client.id} style={{ background: 'transparent', borderBottom: '1px solid rgba(255, 255, 255, 0.03)', borderRight: '1px solid rgba(255, 255, 255, 0.03)' }}></td>;
                                                    }

                                                    // Stock & Picking logic for background color
                                                    const remaining = cell.ordered - cell.picked;
                                                    const currentStock = product.current_stock || 0;
                                                    const pickedPercentage = cell.ordered > 0 ? (cell.picked / cell.ordered) : 0;

                                                    let bg = 'rgba(30, 41, 59, 0.8)'; // Normal Premium Dark Cell (GRIS)
                                                    let fg = '#F8FAFC';

                                                    if (remaining <= 0 || currentStock >= remaining) {
                                                        // 1. GRIS
                                                        if (cell.picked >= cell.ordered) {
                                                            bg = 'rgba(16, 185, 129, 0.15)'; // Elegant green for completed
                                                            fg = '#10B981';
                                                        } else {
                                                            bg = 'rgba(30, 41, 59, 0.8)';
                                                            fg = '#F8FAFC';
                                                        }
                                                    } else {
                                                        // Deficit: currentStock < remaining
                                                        if (pickedPercentage >= 0.8) {
                                                            // 3. ROJO: picked >= 80%, but deficit exists
                                                            bg = 'rgba(239, 68, 68, 0.15)';
                                                            fg = '#EF4444';
                                                        } else {
                                                            // 2. AMARILLO: insufficient to start/continue picking
                                                            bg = 'rgba(245, 158, 11, 0.15)';
                                                            fg = '#F59E0B';
                                                        }
                                                    }

                                                    const isPartial = cell.picked > 0 && cell.picked < cell.ordered;

                                                    return (
                                                        <td key={client.id}
                                                            onClick={() => handleCellClick(product, client.company_name, cell)}
                                                            style={{
                                                                background: bg, color: fg,
                                                                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                                                borderRight: '1px solid rgba(255, 255, 255, 0.05)',
                                                                textAlign: 'center', fontWeight: 'bold',
                                                                fontSize: cfg.fontSize,
                                                                cursor: 'pointer', transition: 'all 0.15s ease',
                                                                position: 'relative',
                                                                height: cfg.cellHeight,
                                                                fontFamily: 'Inter, sans-serif'
                                                            }}
                                                        >
                                                            {isPartial ? (
                                                                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2', alignItems: 'center', justifyContent: 'center' }}>
                                                                    <span style={{ color: fg, fontSize: cfg.fontSize }}>{cell.picked}</span>
                                                                    <span style={{ fontSize: cfg.clientFontSize, color: '#64748B', borderTop: '1px solid rgba(255,255,255,0.1)', width: '60%', marginTop: '2px', paddingTop: '1px' }}>{cell.ordered}</span>
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
            <div style={{
                backgroundColor: '#F59E0B',
                color: '#020617',
                padding: '0.35rem 1rem',
                fontWeight: '700',
                fontSize: '0.8rem',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                zIndex: 50,
                fontFamily: 'Outfit, sans-serif',
                letterSpacing: '0.5px'
            }}>
                <div className="animate-marquee inline-block">
                    *** SEGUIMIENTO EN VIVO *** OPERACIÓN FLUIDA *** VERIFICACIÓN AUTOMÁTICA DE CALIDAD AL COMPLETAR PICKING *** RUTAS DE DESPACHO EN PREPARACIÓN ***
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
                @keyframes marqueeAlert {
                    from { transform: translateX(0); }
                    to { transform: translateX(-100%); }
                }
            `}</style>

            {/* MILESTONE POPUP */}
            {milestone && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    background: 'rgba(9, 13, 22, 0.95)', border: '2px solid #10B981',
                    padding: '2.5rem 4rem', borderRadius: '16px', zIndex: 100,
                    textAlign: 'center', boxShadow: '0 0 40px rgba(16, 185, 129, 0.25)',
                    animation: 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                    backdropFilter: 'blur(10px)'
                }}>
                    <div style={{ fontSize: '1.2rem', color: '#94A3B8', marginBottom: '8px', fontFamily: 'Outfit, sans-serif', fontWeight: '600' }}>
                        {milestone.type === 'CLIENT' ? 'PEDIDO COMPLETADO' : 'ZONA LISTA'}
                    </div>
                    <div style={{ fontSize: '2.5rem', fontWeight: '800', color: '#10B981', textTransform: 'uppercase', fontFamily: 'Outfit, sans-serif', marginBottom: '10px' }}>
                        {milestone.name}
                    </div>
                    <div style={{ fontSize: '4rem', lineHeight: '1' }}>🎉</div>
                </div>
            )}
        </main>
    );
}
