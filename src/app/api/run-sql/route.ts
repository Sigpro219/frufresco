import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';

const regions = [
    { prov: 'aws-0', name: 'us-east-1' },
    { prov: 'aws-0', name: 'us-east-2' },
    { prov: 'aws-0', name: 'us-west-1' },
    { prov: 'aws-0', name: 'us-west-2' },
    { prov: 'aws-0', name: 'ca-central-1' },
    { prov: 'aws-0', name: 'sa-east-1' },
    { prov: 'aws-0', name: 'eu-west-1' },
    { prov: 'aws-0', name: 'eu-west-2' },
    { prov: 'aws-0', name: 'eu-west-3' },
    { prov: 'aws-0', name: 'eu-central-1' },
    { prov: 'aws-0', name: 'eu-north-1' },
    { prov: 'aws-0', name: 'ap-northeast-1' },
    { prov: 'aws-0', name: 'ap-northeast-2' },
    { prov: 'aws-0', name: 'ap-northeast-3' },
    { prov: 'aws-0', name: 'ap-southeast-1' },
    { prov: 'aws-0', name: 'ap-southeast-2' },
    { prov: 'aws-0', name: 'ap-south-1' },
    { prov: 'aws-0', name: 'me-central-1' },
    { prov: 'aws-0', name: 'af-south-1' },
    { prov: 'gcp-0', name: 'us-east4' },
    { prov: 'gcp-0', name: 'us-central1' },
    { prov: 'gcp-0', name: 'europe-west3' },
    { prov: 'gcp-0', name: 'europe-west2' },
    { prov: 'gcp-0', name: 'asia-northeast1' },
    { prov: 'gcp-0', name: 'asia-southeast1' },
    { prov: 'gcp-0', name: 'southamerica-east1' }
];

export async function GET(req: NextRequest) {
    const project = 'csqurhdykbalvlnpowcz';
    const dbPass = 'Frufresco2026*';
    
    let activeHost = null;
    let lastError: any = null;
    
    // We try to connect to pooler host on port 6543
    for (const r of regions) {
        const host = `${r.prov}-${r.name}.pooler.supabase.com`;
        const connectionString = `postgresql://postgres.${project}:${dbPass}@${host}:6543/postgres`;
        
        console.log(`[Run SQL] Trying ${host}...`);
        const client = new Client({ 
            connectionString,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 2000
        });
        
        try {
            await client.connect();
            console.log(`[Run SQL] SUCCESS! Connected to pooler host: ${host}`);
            activeHost = host;
            
            console.log("[Run SQL] Running query to add missing audit columns to 'routes'...");
            await client.query(`
                ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS check_evidence_url TEXT;
                ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS check_mode TEXT DEFAULT 'digital';
                ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS rectified_by_id UUID REFERENCES public.profiles(id);
                ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS rectified_by_name TEXT;
                ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS rectified_at TIMESTAMPTZ;
                ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS is_certified_complete BOOLEAN DEFAULT FALSE;
                ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS certification_notes TEXT;
            `);
            
            const res = await client.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'routes';
            `);
            
            await client.end();
            
            return NextResponse.json({
                success: true,
                message: "Audit columns added to 'routes' table successfully.",
                host: activeHost,
                columns: res.rows
            });
        } catch (err: any) {
            console.log(`[Run SQL] Failed for ${host}:`, err.message);
            lastError = err;
            try {
                await client.end();
            } catch (_) {}
        }
    }
    
    return NextResponse.json({
        success: false,
        message: "Failed to connect to any pooler host region.",
        error: lastError?.message,
        stack: lastError?.stack
    }, { status: 500 });
}
