'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getFriendlyOrderId } from '@/lib/orderUtils';

// Types
interface Order {
    id: string;
    customer_name: string;
    shipping_address: string;
    delivery_date: string;
    status: string;
    total: number;
    origin_source: string;
    type: string;
    created_at: string;
    sequence_id?: number;
    customer_phone?: string;
    latitude?: number;
    longitude?: number;
    total_weight_kg?: number;
    profile?: {
        company_name?: string;
        latitude?: number;
        longitude?: number;
    };
    order_items?: Array<{
        quantity: number;
        product?: {
            name: string;
            unit_of_measure: string;
            weight_kg?: number;
        };
    }>;
}

const getBogotaDate = (offsetDays: number = 0): string => {
    const now = new Date();
    const bogotaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    bogotaTime.setDate(bogotaTime.getDate() + offsetDays);
    return bogotaTime.toISOString().split('T')[0];
};

const getStatusStyle = (status: string) => {
    const styles: Record<string, { bg: string; text: string }> = {
        pending_approval: { bg: '#FEF3C7', text: '#92400E' },
        para_compra: { bg: '#DBEAFE', text: '#1E40AF' },
        approved: { bg: '#D1FAE5', text: '#065F46' },
        shipped: { bg: '#E0E7FF', text: '#3730A3' },
        delivered: { bg: '#D1FAE5', text: '#065F46' },
        cancelled: { bg: '#FEE2E2', text: '#991B1B' },
    };
    return styles[status] || { bg: '#F3F4F6', text: '#1F2937' };
};

export default function OrderLoading() {
    // MINIMAL STATE
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(getBogotaDate(0));
    const [filterSource, setFilterSource] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    // SINGLE EFFECT - NO COMPLEXITY
    useEffect(() => {
        let active = true;
        
        const fetchOrders = async () => {
            console.log('🔄 FETCHING ORDERS - SIMPLE VERSION');
            setLoading(true);
            
            try {
                let query = supabase
                    .from('orders')
                    .select('*')
                    .eq('delivery_date', selectedDate)
                    .order('created_at', { ascending: false });

                if (filterSource !== 'all') {
                    query = query.eq('origin_source', filterSource);
                }
                if (filterStatus !== 'all') {
                    query = query.eq('status', filterStatus);
                }

                const { data, error } = await query;
                
                console.log('📦 Response:', { error, count: data?.length });
                
                if (error) {
                    console.error('❌ Error:', error);
                    return;
                }

                if (active) {
                    setOrders(data || []);
                }
            } catch (err) {
                console.error('❌ Exception:', err);
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        fetchOrders();

        return () => {
            active = false;
        };
    }, [selectedDate, filterSource, filterStatus]);

    // CLIENT-SIDE FILTERING
    const filteredOrders = orders.filter(order => {
        if (!searchTerm) return true;
        const search = searchTerm.toLowerCase();
        return (
            order.customer_name?.toLowerCase().includes(search) ||
            order.shipping_address?.toLowerCase().includes(search) ||
            order.id.toLowerCase().includes(search)
        );
    });

    const totalRevenue = filteredOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalWeight = filteredOrders.reduce((sum, o) => sum + (o.total_weight_kg || 0), 0);
    const pendingCount = filteredOrders.filter(o => o.status === 'pending_approval').length;

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', padding: '2rem 1rem' }}>
            <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
                <div style={{ marginBottom: '2rem' }}>
                    <h1 style={{ fontSize: '2rem', fontWeight: '800', color: '#0F172A' }}>
                        📋 Cargue de Pedidos - MODO ESTABLE
                    </h1>
                </div>

                {/* KPIs */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                    <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: '#64748B' }}>Total</div>
                        <div style={{ fontSize: '2rem', fontWeight: '800', color: '#0F172A' }}>{filteredOrders.length}</div>
                    </div>
                    <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: '#64748B' }}>Ventas</div>
                        <div style={{ fontSize: '2rem', fontWeight: '800', color: '#059669' }}>${totalRevenue.toLocaleString()}</div>
                    </div>
                    <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: '#64748B' }}>Peso</div>
                        <div style={{ fontSize: '2rem', fontWeight: '800', color: '#0891B2' }}>{totalWeight.toFixed(1)} kg</div>
                    </div>
                    <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: '#64748B' }}>Pendientes</div>
                        <div style={{ fontSize: '2rem', fontWeight: '800', color: '#DC2626' }}>{pendingCount}</div>
                    </div>
                </div>

                {/* Filters */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', backgroundColor: 'white', padding: '1.5rem', borderRadius: '16px', marginBottom: '2rem' }}>
                    <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '700' }}>FECHA</label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #E5E7EB', marginTop: '0.25rem' }}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '700' }}>CANAL</label>
                        <select
                            value={filterSource}
                            onChange={(e) => setFilterSource(e.target.value)}
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #E5E7EB', marginTop: '0.25rem' }}
                        >
                            <option value="all">Todos</option>
                            <option value="web">Web</option>
                            <option value="whatsapp">WhatsApp</option>
                            <option value="phone">Teléfono</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '700' }}>ESTADO</label>
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #E5E7EB', marginTop: '0.25rem' }}
                        >
                            <option value="all">Todos</option>
                            <option value="pending_approval">Pendiente</option>
                            <option value="para_compra">Para Compra</option>
                            <option value="approved">Aprobado</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '700' }}>BUSCAR</label>
                        <input
                            type="text"
                            placeholder="Cliente, dirección..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #E5E7EB', marginTop: '0.25rem' }}
                        />
                    </div>
                </div>

                {/* Loading */}
                {loading && (
                    <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: 'white', borderRadius: '16px' }}>
                        <div style={{ fontSize: '3rem' }}>⏳</div>
                        <div style={{ color: '#64748B', fontWeight: '600' }}>Cargando...</div>
                    </div>
                )}

                {/* Empty */}
                {!loading && filteredOrders.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: 'white', borderRadius: '16px' }}>
                        <div style={{ fontSize: '4rem' }}>📭</div>
                        <div style={{ color: '#64748B', fontWeight: '600' }}>No hay pedidos</div>
                    </div>
                )}

                {/* Table */}
                {!loading && filteredOrders.length > 0 && (
                    <div style={{ backgroundColor: 'white', borderRadius: '16px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: '#64748B' }}>ID</th>
                                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: '#64748B' }}>CLIENTE</th>
                                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: '#64748B' }}>DIRECCIÓN</th>
                                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: '#64748B' }}>CANAL</th>
                                    <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '700', color: '#64748B' }}>TOTAL</th>
                                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: '#64748B' }}>ESTADO</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredOrders.map((order) => {
                                    const statusStyle = getStatusStyle(order.status);
                                    return (
                                        <tr key={order.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                            <td style={{ padding: '1rem', fontWeight: '700', fontFamily: 'monospace', color: '#0F172A' }}>
                                                {getFriendlyOrderId(order)}
                                            </td>
                                            <td style={{ padding: '1rem', fontWeight: '600', color: '#0F172A' }}>
                                                {order.customer_name}
                                            </td>
                                            <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#475569' }}>
                                                {order.shipping_address}
                                            </td>
                                            <td style={{ padding: '1rem' }}>
                                                {order.origin_source === 'web' && '🌐'}
                                                {order.origin_source === 'whatsapp' && '💬'}
                                                {order.origin_source === 'phone' && '📞'}
                                            </td>
                                            <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '700', color: '#059669' }}>
                                                ${order.total.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '1rem' }}>
                                                <span style={{ 
                                                    backgroundColor: statusStyle.bg, 
                                                    color: statusStyle.text, 
                                                    padding: '0.25rem 0.75rem', 
                                                    borderRadius: '12px', 
                                                    fontSize: '0.75rem', 
                                                    fontWeight: '700'
                                                }}>
                                                    {order.status.replace('_', ' ').toUpperCase()}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                <div style={{ textAlign: 'center', marginTop: '1rem', color: '#94A3B8', fontSize: '0.8rem' }}>
                    Modo Estable - Simple y Confiable
                </div>
            </div>
        </div>
    );
}
