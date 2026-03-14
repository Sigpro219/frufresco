import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kuxnixwoacwsotcilhuz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU';
const supabase = createClient(supabaseUrl, supabaseKey);

const baseOrder = {
    type: 'b2c_wompi',
    status: 'approved',
    origin_source: 'test_script',
    delivery_date: new Date().toISOString().split('T')[0],
    shipping_address: 'Calle Falsa 123',
    customer_email: 'test@gourmet.com',
    customer_phone: '1234567890'
};

const testOrders = [
    {
        ...baseOrder,
        customer_name: "TESTING - Restaurante El Gourmet",
        total: 1500000,
        subtotal: 1500000,
        latitude: 4.6482837,
        longitude: -74.0627541,
    },
    {
        ...baseOrder,
        customer_name: "TESTING - Juan Pérez",
        total: 85000,
        subtotal: 85000,
        latitude: 4.6322837,
        longitude: -74.0727541,
    },
    {
        ...baseOrder,
        customer_name: "TESTING - Supermercados La Gran Vía",
        total: 4200000,
        subtotal: 4200000,
        latitude: 4.6182837,
        longitude: -74.1627541,
    },
    {
        ...baseOrder,
        customer_name: "TESTING - María Gómez",
        total: 55000,
        subtotal: 55000,
        latitude: 4.7482837,
        longitude: -74.0627541,
    },
    {
        ...baseOrder,
        customer_name: "TESTING - Cafetería Central",
        total: 450000,
        subtotal: 450000,
        latitude: 4.6982837,
        longitude: -74.0327541,
    }
];

async function seedOrders() {
    console.log('Inserting 5 test orders...');
    const { data, error } = await supabase.from('orders').insert(testOrders).select('id');
    
    if (error) {
        console.error('Error inserting test orders:', error);
    } else {
        console.log('Successfully inserted test orders with IDs:', data.map(d => d.id).join(', '));
    }
}

seedOrders();
