require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    // 1. Check distinct roles / channels in profiles
    const { data: profiles } = await supabase
        .from('profiles')
        .select('role, client_type, segment, channel, business_type')
        .limit(200);

    console.log('Sample profile fields:');
    const roleCounts = {};
    const clientTypeCounts = {};
    const segmentCounts = {};
    const channelCounts = {};
    const businessTypeCounts = {};

    profiles?.forEach(p => {
        if (p.role) roleCounts[p.role] = (roleCounts[p.role] || 0) + 1;
        if (p.client_type) clientTypeCounts[p.client_type] = (clientTypeCounts[p.client_type] || 0) + 1;
        if (p.segment) segmentCounts[p.segment] = (segmentCounts[p.segment] || 0) + 1;
        if (p.channel) channelCounts[p.channel] = (channelCounts[p.channel] || 0) + 1;
        if (p.business_type) businessTypeCounts[p.business_type] = (businessTypeCounts[p.business_type] || 0) + 1;
    });

    console.log({ roleCounts, clientTypeCounts, segmentCounts, channelCounts, businessTypeCounts });

    // 2. Check orders type / channel
    const { data: orders } = await supabase
        .from('orders')
        .select('type, channel')
        .limit(200);

    const orderTypes = {};
    const orderChannels = {};
    orders?.forEach(o => {
        if (o.type) orderTypes[o.type] = (orderTypes[o.type] || 0) + 1;
        if (o.channel) orderChannels[o.channel] = (orderChannels[o.channel] || 0) + 1;
    });
    console.log({ orderTypes, orderChannels });
})();
