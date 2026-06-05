'use client';

import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { isAbortError } from '@/lib/errorUtils';
import { CATEGORY_MAP } from '@/lib/constants';
import { 
    Monitor, 
    LayoutGrid, 
    Tv, 
    Bell, 
    AlertTriangle, 
    AlertOctagon, 
    AlertCircle, 
    CheckCircle, 
    Check, 
    Calendar,
    X,
    XCircle,
    Target
} from 'lucide-react';

// Types
type Product = {
    id: string;
    name: string;
    category: string;
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

export default function PickingDashboard() {
    const router = useRouter();
    const isMounted = useRef(true);
    const [density, setDensity] = useState<'standard' | 'high' | 'tv' | 'fids'>('standard');

    // Persistence for density preference
    useEffect(() => {
        const saved = localStorage.getItem('picking_dashboard_density');
        if (saved === 'high' || saved === 'tv' || saved === 'standard' || saved === 'fids') {
            setDensity(saved as any);
        }
    }, []);

    const changeDensity = (val: 'standard' | 'high' | 'tv' | 'fids') => {
        setDensity(val);
        localStorage.setItem('picking_dashboard_density', val);
    };

    const DENSITY_CONFIG = {
        standard: {
            cellWidth: '40px',
            cellHeight: '40px',
            fontSize: '1rem',
            laneFontSize: '1.3rem',
            clientFontSize: '0.75rem',
            productFontSize: '0.9rem',
            headerHeight: '85px',
            hideExternal: false,
            clientHeaderHeight: '160px'
        },
        high: {
            cellWidth: '32px',
            cellHeight: '32px',
            fontSize: '0.85rem',
            laneFontSize: '1.1rem',
            clientFontSize: '0.65rem',
            productFontSize: '0.8rem',
            headerHeight: '75px',
            hideExternal: false,
            clientHeaderHeight: '140px'
        },
        tv: {
            cellWidth: '22px',
            cellHeight: '22px',
            fontSize: '0.7rem',
            laneFontSize: '0.85rem',
            clientFontSize: '0.55rem',
            productFontSize: '0.75rem',
            headerHeight: '60px',
            hideExternal: true,
            clientHeaderHeight: '120px'
        },
        fids: {
            cellWidth: '22px',
            cellHeight: '22px',
            fontSize: '0.7rem',
            laneFontSize: '0.85rem',
            clientFontSize: '0.55rem',
            productFontSize: '0.75rem',
            headerHeight: '60px',
            hideExternal: true,
            clientHeaderHeight: '120px'
        }
    };

    const cfg = DENSITY_CONFIG[density];

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    // STATE
    const [matrix, setMatrix] = useState<Record<string, Record<string, CellData>>>({});
    const [clients, setClients] = useState<{ id: string, company_name: string, order_short: string, zone_name: string, warehouse_spaces?: number[], crates_count?: number, departure_time?: string }[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [showBannerModal, setShowBannerModal] = useState(false);

    useEffect(() => {
        // Hydration fix for time
        setCurrentTime(new Date().toLocaleTimeString());
        const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        // Lock window scroll when picking dashboard is mounted
        const origHtmlOverflow = document.documentElement.style.overflow;
        const origHtmlHeight = document.documentElement.style.height;
        const origBodyOverflow = document.body.style.overflow;
        const origBodyHeight = document.body.style.height;

        document.documentElement.style.setProperty('overflow', 'hidden', 'important');
        document.documentElement.style.setProperty('height', '100vh', 'important');
        document.body.style.setProperty('overflow', 'hidden', 'important');
        document.body.style.setProperty('height', '100vh', 'important');

        return () => {
            document.documentElement.style.overflow = origHtmlOverflow;
            document.documentElement.style.height = origHtmlHeight;
            document.body.style.overflow = origBodyOverflow;
            document.body.style.height = origBodyHeight;
        };
    }, []);

    const loadData = useCallback(async (signal?: AbortSignal, silent = false) => {
        if (!silent) setLoading(true);
        try {
            // 1. Fetch Active Orders
            let ordersQuery = supabase
                .from('orders')
                .select(`
                    id, status, warehouse_spaces, crates_count, sequence_id,
                    profiles:profile_id (
                        id, company_name, contact_name, role, id_zr
                    ),
                    order_items (
                        id, product_id, quantity, picked_quantity, quality_status
                    )
                `)
                .in('status', ['para_compra', 'approved', 'picking']);
            
            if (signal) ordersQuery = ordersQuery.abortSignal(signal);

            const { data: orders } = await ordersQuery;

            const getOrderName = (order: any): string => {
                const p = order.profiles;
                if (!p) return '';
                if (p.role === 'b2b_client') return p.company_name || 'Sin Razón Social';
                return p.contact_name || p.company_name || 'Cliente B2C';
            };

            const activeOrders = (orders || []).filter(o => o.order_items && o.order_items.length > 0);

            // 2. Fetch routes and route_stops to get assigned vehicle
            const orderIds = activeOrders.map(o => o.id);
            const { data: routeStops } = await supabase
                .from('route_stops')
                .select(`
                    order_id,
                    routes (
                        vehicle_plate,
                        logic_parameters_snapshot
                    )
                `)
                .in('order_id', orderIds)
                .abortSignal(signal as any);

            // NEW: Fetch fleet_vehicles to map plate -> driver name
            const { data: fleet } = await supabase.from('fleet_vehicles').select('plate, collaborators:driver_id(contact_name)').abortSignal(signal as any);
            const plateToDriver = new Map<string, string>();
            (fleet || []).forEach(f => {
                if (f.plate && f.collaborators && f.collaborators.contact_name) {
                    const parts = f.collaborators.contact_name.split(' ').filter(Boolean);
                    const shortName = parts.length >= 3 ? `${parts[0]} ${parts[2]}` : parts[0];
                    plateToDriver.set(f.plate, shortName);
                }
            });

            const orderToPlate = new Map<string, string>();
            const orderToTime = new Map<string, string>();
            (routeStops || []).forEach((stop: any) => {
                if (stop.routes && stop.routes.vehicle_plate) {
                    const plate = stop.routes.vehicle_plate;
                    const driverName = plateToDriver.get(plate);
                    const displayName = driverName ? `${plate} (${driverName})` : plate;
                    orderToPlate.set(stop.order_id, displayName);

                    const snap = stop.routes.logic_parameters_snapshot;
                    const depTime = snap?.fleet_start_time || snap?.routeStartTimes?.[plate] || '';
                    orderToTime.set(stop.order_id, depTime);
                }
            });

            // Build columns from individual orders, NOT merged clients
            const formattedClients = activeOrders
                .map(order => {
                    const plate = orderToPlate.get(order.id) || 'SIN ASIGNAR';
                    const baseName = getOrderName(order);
                    const shortId = order.sequence_id ? `#${order.sequence_id}` : `#${order.id.substring(0, 4)}`;
                    const depTime = orderToTime.get(order.id) || '';
                    return {
                        id: order.id, 
                        company_name: baseName,
                        order_short: shortId,
                        zone_name: plate,
                        warehouse_spaces: order.warehouse_spaces || [],
                        crates_count: order.crates_count || 1,
                        departure_time: depTime
                    };
                })
                .sort((a, b) => {
                    const zoneA = a.zone_name.toUpperCase();
                    const zoneB = b.zone_name.toUpperCase();
                    if (zoneA !== zoneB) {
                        if (zoneA === 'SIN ASIGNAR') return 1;
                        if (zoneB === 'SIN ASIGNAR') return -1;
                        return zoneA.localeCompare(zoneB);
                    }
                    
                    // Sort by first assigned space
                    const spaceA = a.warehouse_spaces?.[0] || 999;
                    const spaceB = b.warehouse_spaces?.[0] || 999;
                    if (spaceA !== spaceB) return spaceA - spaceB;

                    const nameA = a.company_name.toUpperCase();
                    const nameB = b.company_name.toUpperCase();
                    return nameA.localeCompare(nameB);
                });

            if (isMounted.current) setClients(formattedClients);

            // 3. Fetch Products with Stock Info
            const { data: prods } = await supabase
                .from('products')
                .select(`
                    id, name, category, buying_team, unit_of_measure, min_inventory_level,
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
            if (activeOrders) {
                activeOrders.forEach(order => {
                    if (order.order_items) {
                        order.order_items.forEach((item: { product_id: string, quantity: number, picked_quantity: number, quality_status?: string | null, id: string }) => {
                            if (!newMatrix[item.product_id]) newMatrix[item.product_id] = {};
                            const currentCell = newMatrix[item.product_id][order.id] || { ordered: 0, picked: 0, hasRejection: false, hasWarning: false, items: [] };
                            const qty = Number(item.quantity) || 0;
                            const picked = Number(item.picked_quantity) || 0;
                            const rejected = item.quality_status === 'red';
                            const warning = item.quality_status === 'yellow';
                            
                            newMatrix[item.product_id][order.id] = {
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

    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    const debouncedLoadData = useCallback(() => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
            loadData(undefined, true);
        }, 2500);
    }, [loadData]);

    useEffect(() => {
        loadData();

        // Realtime Subscription - UNIFIED CHANNEL
        const channel = supabase.channel('picking-realtime', {
            config: {
                broadcast: { ack: true }
            }
        })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, (payload) => {
                console.log('⚡ DB Update (Debouncing...):', payload);
                debouncedLoadData();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
                console.log('⚡ Order Update (Debouncing...):', payload);
                debouncedLoadData();
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
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
            supabase.removeChannel(channel);
        };
    }, [loadData, debouncedLoadData]);

    const handleCellClick = async (product: Product, clientId: string, clientName: string, cellData: CellData) => {
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
        newMatrix[product.id][clientId] = {
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

    // Group Products by Alistamiento Category (buying_team)
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



    // Helper to calculate zone percent
    const getZonePercent = (zoneName: string) => {
        let total = 0;
        let picked = 0;

        const zoneClients = clients.filter(c => c.zone_name === zoneName);

        zoneClients.forEach(c => {
            products.forEach(product => {
                const prodRow = matrix[product.id];
                const cell = prodRow?.[c.id];
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



    // Helper for Client Completion
    const isClientComplete = useCallback((clientId: string) => {
        let hasOrders = false;
        let allItemsPicked = true;

        products.forEach(product => {
            const prodRow = matrix[product.id];
            const cell = prodRow?.[clientId];
            if (cell && cell.ordered > 0) {
                hasOrders = true;
                if (cell.picked < cell.ordered) {
                    allItemsPicked = false;
                }
            }
        });

        return hasOrders && allItemsPicked;
    }, [matrix, products]);

    const isProductComplete = useCallback((productId: string) => {
        const prodRow = matrix[productId];
        if (!prodRow) return false;
        const cells = Object.values(prodRow);
        if (cells.length === 0) return false;
        return cells.every(cell => cell.ordered === 0 || cell.picked >= cell.ordered);
    }, [matrix]);

    const isZoneComplete = useCallback((zoneName: string) => {
        const zoneClients = clients.filter(c => c.zone_name === zoneName);
        if (zoneClients.length === 0) return false;
        return zoneClients.every(c => isClientComplete(c.id));
    }, [clients, isClientComplete]);

    const sortedClients = [...clients].sort((a, b) => {
        // If density is fids, sort by departure_time primarily!
        if (density === 'fids') {
            const timeA = a.departure_time || '99:99';
            const timeB = b.departure_time || '99:99';
            if (timeA !== timeB) {
                return timeA.localeCompare(timeB);
            }
        }

        const isZoneCompleteA = isZoneComplete(a.zone_name);
        const isZoneCompleteB = isZoneComplete(b.zone_name);
        if (isZoneCompleteA !== isZoneCompleteB) {
            return isZoneCompleteA ? 1 : -1; // Complete to the right (end)
        }
        
        const zoneA = a.zone_name.toUpperCase();
        const zoneB = b.zone_name.toUpperCase();
        if (zoneA !== zoneB) {
            if (zoneA === 'SIN ASIGNAR') return 1;
            if (zoneB === 'SIN ASIGNAR') return -1;
            return zoneA.localeCompare(zoneB);
        }
        
        const spaceA = a.warehouse_spaces?.[0] || 999;
        const spaceB = b.warehouse_spaces?.[0] || 999;
        if (spaceA !== spaceB) return spaceA - spaceB;
        
        return a.company_name.localeCompare(b.company_name);
    });

    const isFidsMode = density === 'fids';

    // In FIDS mode, hide completed clients.
    const visibleClients = isFidsMode
        ? sortedClients.filter(c => !isClientComplete(c.id))
        : sortedClients;

    // In FIDS mode, hide completed products.
    const visibleProducts = isFidsMode
        ? products.filter(p => !isProductComplete(p.id))
        : products;

    const zoneHeaders: { name: string; count: number; color: string; percent: number; departureTime?: string }[] = [];
    let currentZone = '';
    let currentCount = 0;
    let currentDepTime = '';

    visibleClients.forEach((client, index) => {
        if (client.zone_name !== currentZone) {
            if (currentZone !== '') {
                zoneHeaders.push({
                    name: currentZone,
                    count: currentCount,
                    color: getZoneColor(currentZone),
                    percent: getZonePercent(currentZone),
                    departureTime: currentDepTime
                });
            }
            currentZone = client.zone_name;
            currentCount = 1;
            currentDepTime = client.departure_time || '';
        } else {
            currentCount++;
        }

        if (index === visibleClients.length - 1) {
            zoneHeaders.push({
                name: currentZone,
                count: currentCount,
                color: getZoneColor(currentZone),
                percent: getZonePercent(currentZone),
                departureTime: currentDepTime
            });
        }
    });

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
            const isDone = isClientComplete(c.id);
            if (isDone) {
                currentCompleted.add(c.id);
                if (!lastCompletedClientsRef.current.has(c.id)) {
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
    let totalGlobalPickedForProgress = 0;
    let totalCompletedUnitsForProgress = 0;
    let totalPartialUnitsForProgress = 0;

    Object.values(matrix).forEach(prodRow => {
        Object.values(prodRow).forEach(cell => {
            totalGlobalOrdered += cell.ordered;
            totalGlobalPicked += cell.picked;

            const pickedForProgress = Math.min(cell.ordered, cell.picked);
            totalGlobalPickedForProgress += pickedForProgress;

            if (cell.ordered > 0) {
                if (cell.picked >= cell.ordered) {
                    totalCompletedUnitsForProgress += cell.ordered;
                } else {
                    totalPartialUnitsForProgress += cell.picked;
                }
            }
        });
    });

    const globalPercent = totalGlobalOrdered > 0
        ? Math.min(100, Math.round((totalGlobalPickedForProgress / totalGlobalOrdered) * 100))
        : 0;

    const percentComplete = totalGlobalOrdered > 0 
        ? Math.min(100, Math.round((totalCompletedUnitsForProgress / totalGlobalOrdered) * 100)) 
        : 0;
        
    const percentPartial = totalGlobalOrdered > 0 
        ? Math.min(100 - percentComplete, Math.round((totalPartialUnitsForProgress / totalGlobalOrdered) * 100)) 
        : 0;

    // Crosshair Highlighting Logic
    const clientsWithAlerts = new Set<string>();
    const productsWithAlerts = new Set<string>();

    Object.entries(matrix).forEach(([prodId, prodRow]) => {
        Object.entries(prodRow).forEach(([clientId, cell]) => {
            if (cell.hasRejection || cell.hasWarning) {
                clientsWithAlerts.add(clientId);
                productsWithAlerts.add(prodId);
            }
        });
    });

    if (loading) return <div style={{ background: '#0A111C', color: '#fff', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', fontSize: '2rem' }}>AGUARDE...</div>;

    // Inventory Alerts Calculation
    const inventoryAlerts = products
        .filter(p => (p.min_inventory_level || 0) > 0 && (p.current_stock || 0) < (p.min_inventory_level || 0))
        .map(p => ({
            name: p.name,
            current: p.current_stock || 0,
            min: p.min_inventory_level || 0
        }));

    // --- SMART BANNER LOGIC ---
    const bannerAlerts: { type: 'critical' | 'warning' | 'info', msg: string }[] = [];

    // Add alerts for fully completed trucks
    const completedZones = zoneHeaders.filter(z => z.percent === 100);
    completedZones.forEach(zone => {
        bannerAlerts.push({
            type: 'critical',
            msg: `🚨 ¡CAMIÓN ${zone.name.toUpperCase()} AL 100%! PROCEDER CON DESPACHO INMEDIATO 🚨`
        });
    });

    if (!isConnected) {
        bannerAlerts.push({ type: 'critical', msg: 'CONEXIÓN PERDIDA - Intentando reconectar...' });
    }

    let hasAnyRejection = false;
    let hasAnyWarning = false;
    
    Object.values(matrix).forEach(prodRow => {
        Object.values(prodRow).forEach(cell => {
            if (cell.hasRejection) hasAnyRejection = true;
            if (cell.hasWarning) hasAnyWarning = true;
        });
    });

    if (hasAnyRejection) {
        bannerAlerts.push({ type: 'critical', msg: 'CALIDAD: Hay productos rechazados en piso que requieren atención.' });
    }
    if (hasAnyWarning) {
        bannerAlerts.push({ type: 'warning', msg: 'NOVEDAD: Hay advertencias de calidad en productos.' });
    }

    if (inventoryAlerts && inventoryAlerts.length > 0) {
        inventoryAlerts.slice(0, 3).forEach(p => {
            bannerAlerts.push({ type: 'warning', msg: `INVENTARIO: Bajo stock de ${p.name} (Actual: ${p.current})` });
        });
        if (inventoryAlerts.length > 3) {
            bannerAlerts.push({ type: 'warning', msg: `INVENTARIO: Y ${inventoryAlerts.length - 3} alertas más.` });
        }
    }

    if (bannerAlerts.length === 0) {
        bannerAlerts.push({ type: 'info', msg: `OPERACIÓN FLUIDA - Progreso Global: ${percentComplete}%` });
    }

    const hasCritical = bannerAlerts.some(a => a.type === 'critical');
    const hasWarningBanner = bannerAlerts.some(a => a.type === 'warning');
    
    let bannerBg = 'rgba(13, 122, 87, 0.85)';
    let bannerFg = 'white';
    let bannerBorder = '1px solid rgba(13, 122, 87, 0.4)';
    if (hasCritical) {
        bannerBg = 'rgba(239, 68, 68, 0.85)';
        bannerFg = 'white';
        bannerBorder = '1px solid rgba(239, 68, 68, 0.4)';
    } else if (hasWarningBanner) {
        bannerBg = 'rgba(234, 179, 8, 0.85)';
        bannerFg = 'black';
        bannerBorder = '1px solid rgba(234, 179, 8, 0.4)';
    }

    const bannerText = bannerAlerts.map(a => a.msg).join(' ••• ');

    return (
        <div style={{ backgroundColor: '#080D12', height: '100%', color: '#F8FAFC', fontFamily: "Inter, system-ui, sans-serif", display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* TOP HEADER */}
            <header style={{ 
                height: cfg.headerHeight, 
                borderBottom: '1px solid rgba(255,255,255,0.05)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                padding: density === 'tv' ? '0 1rem' : '0 2rem', 
                background: '#0F1820',
                boxSizing: 'border-box',
                flexShrink: 0,
                zIndex: 10
            }}>
                <div
                    onClick={() => router.push('/ops')}
                    style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: density === 'tv' ? '0.5rem' : '1rem', 
                        color: '#0D7A57', 
                        fontWeight: '900', 
                        fontSize: density === 'tv' ? '1rem' : '1.5rem', 
                        cursor: 'pointer' 
                    }}>
                    <img src="/logo_completo_compacto.png" alt="Fru Fresco" style={{ height: density === 'tv' ? '30px' : '45px', objectFit: 'contain', borderRadius: '6px' }} />
                    <span style={{ color: '#475569', marginLeft: '8px' }}>|</span> <span style={{ color: '#fff', marginLeft: '8px' }}>PICKING</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '3rem' }}>
                    {/* ADVANCED PROGRESS BAR */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '400px', marginTop: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 'bold', color: '#94A3B8', textTransform: 'uppercase' }}>
                            <span>PRODUCCIÓN</span>
                            <span>{totalGlobalPicked} / {totalGlobalOrdered} Und</span>
                        </div>
                        {/* THE BAR */}
                        <div style={{ width: '100%', height: '10px', background: '#0A111C', borderRadius: '6px', overflow: 'hidden', display: 'flex', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{
                                width: `${percentComplete}%`,
                                background: '#0D7A57',
                                height: '100%',
                                transition: 'width 0.5s'
                            }} title={`Terminado: ${percentComplete}%`}></div>

                            <div style={{
                                width: `${percentPartial}%`,
                                background: '#EAB308',
                                height: '100%',
                                transition: 'width 0.5s'
                            }} title={`Parcial: ${percentPartial}%`}></div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: '600' }}>
                            <span style={{ color: '#0D7A57' }}>⬤ {percentComplete}% OK</span>
                            <span style={{ color: '#EAB308' }}>⬤ {percentPartial}% PARCIAL</span>
                        </div>
                    </div>

                    {/* GLOBAL PROGRESS */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: '#94A3B8', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>TOTAL</span>
                        <div style={{
                            fontSize: '2rem',
                            fontWeight: 'bold',
                            color: globalPercent === 100 ? '#10B981' : '#FACC15',
                            textShadow: '0 0 10px rgba(250, 204, 21, 0.1)'
                        }}>
                            {globalPercent}%
                        </div>
                    </div>

                    {/* CLOCK & STATUS */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{
                            padding: '5px 10px', borderRadius: '20px',
                            background: isConnected ? 'rgba(13, 122, 87, 0.1)' : 'rgba(239, 68, 68, 0.2)',
                            border: isConnected ? '1px solid #0D7A57' : '1px solid #EF4444',
                            display: 'flex', alignItems: 'center', gap: '8px'
                        }}>
                            <div style={{
                                width: '10px', height: '10px', borderRadius: '50%',
                                background: isConnected ? '#0D7A57' : '#EF4444',
                                boxShadow: isConnected ? '0 0 10px #0D7A57' : '0 0 10px #EF4444',
                                animation: !isConnected ? 'pulseAlert 1s infinite' : 'none'
                            }}></div>
                            {!isConnected && <span style={{ fontSize: '0.7rem', color: '#EF4444', fontWeight: 'bold' }}>DESCONECTADO</span>}
                        </div>

                         <div style={{ fontSize: density === 'tv' ? '1.2rem' : '2rem', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums', minWidth: density === 'tv' ? '90px' : '150px', textAlign: 'right' }}>{currentTime}</div>

                        {/* DENSITY SELECTOR */}
                        <div style={{ 
                            display: 'flex', 
                            background: '#0A111C', 
                            padding: '3px', 
                            borderRadius: '8px', 
                            border: '1px solid rgba(255,255,255,0.08)',
                            marginLeft: '10px',
                            gap: '2px'
                        }}>
                            <button 
                                onClick={() => changeDensity('standard')}
                                style={{
                                    padding: '5px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                                    background: density === 'standard' ? '#0D7A57' : 'transparent',
                                    color: density === 'standard' ? 'white' : '#888',
                                    transition: 'all 0.2s',
                                    display: 'flex', alignItems: 'center'
                                }} title="Estándar"><Monitor size={14} strokeWidth={2.5} /></button>
                            <button 
                                onClick={() => changeDensity('high')}
                                style={{
                                    padding: '5px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                                    background: density === 'high' ? '#0D7A57' : 'transparent',
                                    color: density === 'high' ? 'white' : '#888',
                                    transition: 'all 0.2s',
                                    display: 'flex', alignItems: 'center'
                                }} title="Alta Densidad"><LayoutGrid size={14} strokeWidth={2.5} /></button>
                            <button 
                                onClick={() => changeDensity('tv')}
                                style={{
                                    padding: '5px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                                    background: density === 'tv' ? '#0D7A57' : 'transparent',
                                    color: density === 'tv' ? 'white' : '#888',
                                    transition: 'all 0.2s',
                                    display: 'flex', alignItems: 'center'
                                }} title="Modo TV"><Tv size={14} strokeWidth={2.5} /></button>
                            <button 
                                onClick={() => changeDensity('fids')}
                                style={{
                                    padding: '5px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                                    background: density === 'fids' ? '#0D7A57' : 'transparent',
                                    color: density === 'fids' ? 'white' : '#888',
                                    transition: 'all 0.2s',
                                    display: 'flex', alignItems: 'center',
                                    gap: '4px'
                                }} title="Modo FIDS / Foco">
                                <Target size={14} strokeWidth={2.5} />
                                {density === 'fids' && <span style={{ fontSize: '0.65rem', fontWeight: 'bold' }}>FIDS</span>}
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* TOP HEADER IS FLOW RELATIVE, NO SPACER REQUIRED */}

            {/* INVENTORY ALERT BANNER */}
            {inventoryAlerts && inventoryAlerts.length > 0 && (
                <div style={{ 
                    backgroundColor: '#FEF3C7', 
                    color: '#92400E', 
                    padding: '0.6rem 2rem', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '1rem',
                    borderBottom: '2px solid #F59E0B',
                    zIndex: 100,
                    fontWeight: '800',
                    fontSize: '0.9rem',
                    overflow: 'hidden'
                }}>
                    <AlertTriangle size={18} className="text-amber-700" />
                    <div style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        <div style={{ 
                            display: 'inline-block', 
                            animation: inventoryAlerts.length > 2 ? 'marqueeAlert 30s linear infinite' : 'none',
                            paddingLeft: '100%'
                        }}>
                            <span style={{ marginRight: '2rem', color: '#B45309' }}>¡ATENCIÓN SECTOR PICKING! REVISAR ABASTECIMIENTO:</span>
                            {inventoryAlerts.map((alert, idx) => (
                                <span key={idx} style={{ marginRight: '3rem' }}>
                                    La carga de <strong style={{ textDecoration: 'underline' }}>{alert.name}</strong> está por debajo del mínimo (Actual: {alert.current} | Mín: {alert.min})
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* SCROLLABLE GRID */}
            <div style={{ flex: 1, overflow: 'auto', position: 'relative', paddingBottom: '32px' }}>
                <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content' }}>
                    <thead>
                        {/* ROW 1: ZONES (Sticky Top) */}
                        <tr>
                            <th style={{
                                position: 'sticky', top: 0, left: 0, zIndex: 40,
                                background: '#080D12', minWidth: '200px',
                                borderBottom: '1px solid rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.05)',
                                height: '44px'
                            }}></th>

                            {zoneHeaders.map((zone, i) => {
                                const complete = zone.percent === 100;
                                return (
                                    <th key={i} colSpan={zone.count} style={{
                                        position: 'sticky', top: 0, zIndex: 30,
                                        background: '#0F1820',
                                        color: complete ? '#34D399' : zone.color,
                                        borderBottom: `4px solid ${complete ? '#10B981' : zone.color}`,
                                        borderRight: '1px solid rgba(255,255,255,0.05)',
                                        textAlign: 'center',
                                        fontWeight: 'bold',
                                        fontSize: '1rem',
                                        padding: '0.5rem 0'
                                    }}>
                                        {complete ? (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                                                <span>✓ {zone.name.toUpperCase()}</span>
                                                <span style={{
                                                    background: '#EF4444',
                                                    color: '#fff',
                                                    fontSize: '0.7rem',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    marginLeft: '8px',
                                                    animation: 'pulseAlert 1s infinite',
                                                    fontWeight: '900',
                                                    letterSpacing: '0.5px'
                                                }}>
                                                    DESPACHAR YA 🚚💨
                                                </span>
                                            </span>
                                        ) : (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                                <span>{zone.name.toUpperCase()}</span>
                                                {zone.departureTime && (
                                                    <span style={{ 
                                                        background: 'rgba(255,255,255,0.08)', 
                                                        color: '#E2E8F0', 
                                                        fontSize: '0.75rem', 
                                                        padding: '2px 6px', 
                                                        borderRadius: '4px',
                                                        fontWeight: 'bold',
                                                        border: '1px solid rgba(255,255,255,0.1)'
                                                    }}>
                                                        ⏰ {zone.departureTime}
                                                    </span>
                                                )}
                                            </span>
                                        )}
                                        <span style={{ color: '#fff', opacity: 0.7, marginLeft: '5px' }}>{zone.percent}%</span>
                                    </th>
                                );
                            })}
                        </tr>

                        {/* ROW 2: CLIENT NAMES (Vertical) */}
                        <tr>
                            <th style={{
                                position: 'sticky', top: '44px', left: 0, zIndex: 40,
                                background: '#080D12',
                                borderBottom: '1px solid rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.05)',
                                height: cfg.clientHeaderHeight,
                                padding: '12px 16px',
                                boxSizing: 'border-box'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    height: '100%',
                                    fontSize: '0.65rem',
                                    fontWeight: '800',
                                    letterSpacing: '1px'
                                }}>
                                    <div style={{ 
                                        textAlign: 'right', 
                                        color: '#94A3B8',
                                        opacity: 0.8 
                                    }}>
                                        RUTAS / CLIENTES ➔
                                    </div>
                                    <div style={{ 
                                        textAlign: 'left', 
                                        color: '#34D399'
                                    }}>
                                        ▼ PRODUCTOS
                                    </div>
                                </div>
                            </th>

                            {visibleClients.map((client, index) => {
                                const complete = isClientComplete(client.id);
                                return (
                                    <th key={client.id} style={{
                                        position: 'sticky', top: '44px', zIndex: 20,
                                        background: complete ? 'rgba(16, 185, 129, 0.15)' : (clientsWithAlerts.has(client.id) ? '#7F1D1D' : '#0B1319'),
                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                        borderRight: '1px solid rgba(255,255,255,0.04)',
                                        height: cfg.clientHeaderHeight,
                                        verticalAlign: 'top',
                                        padding: '0',
                                        minWidth: cfg.cellWidth,
                                        maxWidth: cfg.cellWidth,
                                        overflow: 'hidden',
                                        animation: clientsWithAlerts.has(client.id) ? 'pulseAlert 1.5s infinite' : 'none'
                                    }}>
                                        <div style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            height: cfg.clientHeaderHeight,
                                            alignItems: 'center',
                                            justifyContent: 'flex-start',
                                            overflow: 'hidden'
                                        }}>
                                            {/* Big Lane Number */}
                                            <div style={{
                                                fontSize: cfg.laneFontSize,
                                                fontWeight: '800',
                                                color: complete ? '#34D399' : '#fff',
                                                marginBottom: '2px',
                                                borderBottom: '1px solid rgba(255,255,255,0.08)',
                                                width: '100%',
                                                textAlign: 'center',
                                                paddingTop: '4px',
                                                paddingBottom: '2px',
                                                flexShrink: 0,
                                                letterSpacing: '-1px'
                                            }} title={`Canastillas: ${client.crates_count || 1}`}>
                                                {client.warehouse_spaces && client.warehouse_spaces.length > 0 
                                                    ? client.warehouse_spaces.join(', ') 
                                                    : '-'}
                                            </div>

                                            {/* Vertical Name */}
                                            <div style={{
                                                writingMode: 'vertical-rl',
                                                transform: 'rotate(180deg)',
                                                whiteSpace: 'nowrap',
                                                fontSize: cfg.clientFontSize, 
                                                fontWeight: '800',
                                                letterSpacing: '0.5px',
                                                color: complete ? '#34D399' : '#fff',
                                                textAlign: 'left',
                                                width: '100%',
                                                flex: 1,
                                                overflow: 'hidden',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'flex-start'
                                            }}>
                                                <div style={{ 
                                                    animation: 'slideClientName 15s linear infinite', 
                                                    whiteSpace: 'nowrap',
                                                    color: complete ? '#34D399' : '#fff'
                                                }}>
                                                    {complete ? '✓ ' : ''}{getClientShortName(client.company_name)}
                                                    <span style={{ opacity: 0 }}>------</span>
                                                    {complete ? '✓ ' : ''}{getClientShortName(client.company_name)}
                                                </div>
                                            </div>
                                        </div>
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>

                    <tbody>
                        {Object.entries(productsByBuyingTeam)
                            .sort(([teamA, prodsA], [teamB, prodsB]) => {
                                const hasActiveA = prodsA.some(p => visibleClients.some(c => matrix[p.id]?.[c.id]));
                                const hasActiveB = prodsB.some(p => visibleClients.some(c => matrix[p.id]?.[c.id]));
                                
                                if (hasActiveA !== hasActiveB) {
                                    return hasActiveA ? -1 : 1; // Empty categories go to the very bottom
                                }
                                
                                const percentA = getCategoryPercent(teamA, prodsA);
                                const percentB = getCategoryPercent(teamB, prodsB);
                                const completeA = percentA === 100;
                                const completeB = percentB === 100;
                                
                                if (completeA !== completeB) {
                                    return completeA ? 1 : -1; // Completed categories go below in-progress
                                }
                                
                                return teamA.localeCompare(teamB);
                            })
                            .map(([team, categoryProducts]) => {
                                const catPercent = getCategoryPercent(team, categoryProducts);
                                const isCatComplete = catPercent === 100;

                                return (
                                    <Fragment key={team}>
                                        {/* Category Header */}
                                        <tr>
                                            <td colSpan={visibleClients.length + 1} style={{
                                                background: '#0F1820', color: '#94A3B8',
                                                fontWeight: 'bold', fontSize: cfg.fontSize,
                                                padding: density === 'tv' ? '0.2rem 1rem' : '0.4rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                position: 'sticky', left: 0
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '20px' }}>
                                                    <span style={{ 
                                                        minWidth: '250px', 
                                                        display: 'inline-block',
                                                        color: isCatComplete ? '#34D399' : '#94A3B8'
                                                    }}>
                                                        {isCatComplete ? '✓ ' : ''}{team.toUpperCase()}
                                                    </span>

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        {/* Mini Progress Bar Background */}
                                                        <div style={{ width: '100px', height: '6px', background: '#080D12', borderRadius: '3px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                            <div style={{
                                                                width: `${catPercent}%`,
                                                                height: '100%',
                                                                background: isCatComplete ? '#0D7A57' : '#FACC15',
                                                                transition: 'width 0.5s ease'
                                                            }} />
                                                        </div>

                                                        <span style={{
                                                            color: catPercent === 0 ? '#fff' : (isCatComplete ? '#34D399' : '#FACC15'),
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
                                            const rowHasData = visibleClients.some(c => matrix[product.id]?.[c.id]);
                                            if (!rowHasData) return null;

                                            return (
                                                <tr key={product.id}>
                                                    {(() => {
                                                        const prodComplete = isProductComplete(product.id);
                                                        return (
                                                            <td style={{
                                                                position: 'sticky', left: 0, zIndex: 10,
                                                                background: productsWithAlerts.has(product.id) ? 'rgba(239, 68, 68, 0.2)' : '#080D12',
                                                                borderRight: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.04)',
                                                                padding: density === 'tv' ? '0.2rem 0.5rem' : '0.5rem 1rem',
                                                                color: productsWithAlerts.has(product.id) ? '#fff' : (prodComplete ? '#34D399' : '#ddd'), 
                                                                fontSize: cfg.productFontSize,
                                                                minWidth: density === 'tv' ? '150px' : '250px', maxWidth: '400px',
                                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                                fontWeight: prodComplete ? 'bold' : 'normal',
                                                                animation: productsWithAlerts.has(product.id) ? 'pulseAlert 2s infinite' : 'none'
                                                            }} title={product.name}>
                                                                {prodComplete ? '✓ ' : ''}{product.name}
                                                                <span style={{ marginLeft: '8px', fontSize: '0.7rem', color: prodComplete ? '#10B981' : '#555' }}>
                                                                    {product.unit_of_measure}
                                                                </span>
                                                            </td>
                                                        );
                                                    })()}

                                                    {/* Matrix Cells */}
                                                    {visibleClients.map(client => {
                                                    const cell = matrix[product.id]?.[client.id];

                                                    if (!cell || cell.ordered === 0) {
                                                        return (
                                                            <td 
                                                                key={client.id} 
                                                                style={{ 
                                                                    background: isFidsMode ? 'transparent' : '#0B1319', 
                                                                    borderBottom: isFidsMode ? '1px solid transparent' : '1px solid rgba(255,255,255,0.02)', 
                                                                    borderRight: isFidsMode ? '1px solid transparent' : '1px solid rgba(255,255,255,0.02)' 
                                                                }}
                                                            />
                                                        );
                                                    }

                                                    // State Logic
                                                    let bg = '#0B1319';
                                                    let fg = '#475569';
                                                    if (cell.picked > 0) { bg = '#2D1E08'; fg = '#FBBF24'; } // Picking
                                                    if (cell.picked >= cell.ordered) { bg = 'rgba(16, 185, 129, 0.15)'; fg = '#34D399'; } // Ready

                                                    // REJECTION & WARNING OVERRIDES
                                                    if (cell.hasRejection) {
                                                        bg = '#EF4444'; 
                                                        fg = '#fff';
                                                    } else if (cell.hasWarning) {
                                                        bg = 'rgba(245, 158, 11, 0.25)';
                                                        fg = '#FCD34D';
                                                    }

                                                    // If just ordered but not picked
                                                    if (cell.ordered > 0 && cell.picked === 0) {
                                                        bg = '#1E293B';
                                                        fg = '#E2E8F0';
                                                    }

                                                    const isPartial = cell.picked > 0 && cell.picked < cell.ordered;

                                                    return (
                                                        <td key={client.id}
                                                            onClick={() => handleCellClick(product, client.id, client.company_name, cell)}
                                                            style={{
                                                                background: bg, color: fg,
                                                                borderBottom: '1px solid rgba(255,255,255,0.03)', borderRight: '1px solid rgba(255,255,255,0.03)',
                                                                textAlign: 'center', fontWeight: 'bold',
                                                                fontSize: cfg.fontSize,
                                                                height: cfg.cellHeight,
                                                                cursor: 'pointer', transition: 'all 0.1s',
                                                                animation: cell.hasRejection ? 'pulseAlert 1s infinite' : (cell.hasWarning ? 'pulseWarning 1.5s infinite' : 'none'),
                                                                position: 'relative',
                                                                zIndex: (cell.hasRejection || cell.hasWarning) ? 5 : 1
                                                            }}
                                                        >
                                                            {cell.hasRejection ? (
                                                                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1', alignItems: 'center', justifyContent: 'center' }}>
                                                                    <AlertOctagon size={14} />
                                                                    <span style={{ fontSize: '0.65rem' }}> RECHAZO</span>
                                                                </div>
                                                            ) : cell.hasWarning ? (
                                                                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1', alignItems: 'center', justifyContent: 'center' }}>
                                                                    <AlertTriangle size={14} />
                                                                    <span style={{ fontSize: '0.65rem' }}> VERIF</span>
                                                                </div>
                                                            ) : isPartial ? (
                                                                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1' }}>
                                                                    <span style={{ color: '#fff', fontSize: cfg.fontSize }}>{cell.picked}</span>
                                                                    <span style={{ fontSize: `calc(${cfg.fontSize} * 0.7)`, opacity: 0.8, borderTop: '1px solid #555' }}>{cell.ordered}</span>
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
            <div 
                onClick={() => setShowBannerModal(true)}
                style={{ 
                    width: '100%',
                    backgroundColor: bannerBg,
                    color: bannerFg,
                    borderTop: bannerBorder,
                    padding: '0.5rem',
                    fontWeight: 'bold',
                    fontSize: '0.85rem',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    zIndex: 100,
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexShrink: 0
                }}
                title="Clic para ver detalles de alertas"
            >
                <div style={{ 
                    display: 'flex', 
                    width: 'max-content',
                    animation: `marqueeContinuous ${Math.max(85, Math.min(240, bannerText.length * 1.3))}s linear infinite`
                }}>
                    {Array(6).fill(null).map((_, i) => (
                        <span key={i} style={{ paddingRight: '18rem', display: 'inline-block' }}>
                            ••• {bannerText}
                        </span>
                    ))}
                </div>
            </div>

            <style jsx>{`
                :global(#ops-main-header) { display: ${cfg.hideExternal ? 'none' : 'flex'} !important; }
                :global(#ops-main-footer) { display: ${cfg.hideExternal ? 'none' : 'flex'} !important; }
                :global(.ops-theme-wrapper) { height: 100vh !important; display: flex !important; flex-direction: column !important; overflow: hidden !important; }
                :global(.ops-theme-wrapper > main) { 
                    flex: 1 !important; 
                    display: flex !important; 
                    flex-direction: column !important; 
                    overflow: hidden !important; 
                    padding-bottom: ${cfg.hideExternal ? '0' : '60px'} !important; 
                    height: 100% !important; 
                }

                @keyframes marqueeContinuous {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
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
                @keyframes slideClientName {
                    0% { transform: translateY(0); }
                    100% { transform: translateY(-50%); }
                }
            `}</style>

            {/* BANNER MODAL */}
            {showBannerModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                    background: 'rgba(0,0,0,0.8)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }} onClick={() => setShowBannerModal(false)}>
                    <div style={{
                        background: '#121D2D', border: '1px solid rgba(255,255,255,0.08)', padding: '2rem',
                        borderRadius: '16px', minWidth: '400px', maxWidth: '800px',
                        color: '#fff',
                        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)'
                    }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Bell size={24} className="text-slate-400" /> Alertas Activas
                        </h2>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {bannerAlerts.map((a, i) => (
                                <li key={i} style={{ 
                                    padding: '0.75rem', 
                                    background: a.type === 'critical' ? 'rgba(239, 68, 68, 0.15)' : (a.type === 'warning' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(13, 122, 87, 0.15)'),
                                    borderRadius: '12px',
                                    fontWeight: 'bold',
                                    borderLeft: `4px solid ${a.type === 'critical' ? '#EF4444' : (a.type === 'warning' ? '#F59E0B' : '#0D7A57')}`,
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}>
                                    {a.type === 'critical' ? <AlertOctagon size={16} className="text-red-500" /> : (a.type === 'warning' ? <AlertTriangle size={16} className="text-yellow-500" /> : <CheckCircle size={16} className="text-emerald-500" />)}
                                    {a.msg}
                                </li>
                            ))}
                        </ul>
                        <div style={{ marginTop: '2rem', textAlign: 'right' }}>
                            <button onClick={() => setShowBannerModal(false)} style={{
                                background: '#0D7A57', color: '#fff', border: 'none', padding: '0.5rem 1.5rem', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s'
                            }}>Cerrar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MILESTONE POPUP */}
            {milestone && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    background: 'rgba(12, 29, 45, 0.95)', border: '4px solid #0D7A57',
                    padding: '2rem 4rem', borderRadius: '20px', zIndex: 1000,
                    textAlign: 'center', boxShadow: '0 0 50px rgba(13, 122, 87, 0.5)',
                    animation: 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                }}>
                    <div style={{ fontSize: '1.2rem', color: '#94A3B8', marginBottom: '10px', fontWeight: 'bold' }}>
                        {milestone.type === 'CLIENT' ? 'PEDIDO COMPLETADO' : 'ZONA LISTA'}
                    </div>
                    <div style={{ fontSize: '3rem', fontWeight: '900', color: 'white', textTransform: 'uppercase', marginBottom: '1rem' }}>
                        {milestone.name}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <CheckCircle size={64} strokeWidth={1.5} className="text-emerald-500" />
                    </div>
                </div>
            )}
        </div>
    );
}
