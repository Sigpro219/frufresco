import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kuxnixwoacwsotcilhuz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupOrders() {
    console.log('Deleting test orders...');
    const { data, error } = await supabase
        .from('orders')
        .delete()
        .like('customer_name', 'TESTING - %')
        .select('id');
    
    if (error) {
        console.error('Error deleting test orders:', error);
    } else {
        console.log(`Successfully deleted ${data.length} test orders.`);
    }
}

cleanupOrders();
