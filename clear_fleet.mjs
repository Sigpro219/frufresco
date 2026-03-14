import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kuxnixwoacwsotcilhuz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function clearVehicles() {
    console.log('Fetching existing vehicles...');
    const { data: vehicles } = await supabase.from('fleet_vehicles').select('id');
    
    if (vehicles && vehicles.length > 0) {
        console.log(`Borrando ${vehicles.length} vehículos...`);
        for (const v of vehicles) {
            const { error } = await supabase.from('fleet_vehicles').delete().eq('id', v.id);
            if (error) console.error('Error al borrar:', error);
        }
        console.log('Flota borrada exitosamente.');
    } else {
        console.log('No hay vehículos para borrar.');
    }
}

clearVehicles();
