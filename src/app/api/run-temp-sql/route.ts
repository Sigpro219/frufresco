import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';

const regions = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'ca-central-1', 'sa-east-1', 'eu-west-1', 'eu-west-2',
    'eu-west-3', 'eu-central-1', 'eu-north-1', 'ap-south-1',
    'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2'
];

export async function GET(req: NextRequest) {
    const results: any[] = [];
    let foundRegion = null;
    let errorDetail = null;

    for (const r of regions) {
        const host = `aws-0-${r}.pooler.supabase.com`;
        const connectionString = `postgresql://postgres.csqurhdykbalvlnpowcz:postgres@${host}:6543/postgres`;
        const client = new Client({ connectionString, connectionTimeoutMillis: 3000 });
        try {
            await client.connect();
            foundRegion = r;
            await client.query(`
                -- FIX FOR AUTHENTICATED USERS ORDERS INSERT RLS
                ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
                DROP POLICY IF EXISTS "Staff can insert manual orders" ON public.orders;
                DROP POLICY IF EXISTS "Enable authenticated orders insert" ON public.orders;
                CREATE POLICY "Enable authenticated orders insert"
                ON public.orders FOR INSERT TO authenticated WITH CHECK (true);
                GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE public.orders TO authenticated;

                ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
                DROP POLICY IF EXISTS "Authenticated users can modify order items" ON public.order_items;
                DROP POLICY IF EXISTS "Enable authenticated order_items insert" ON public.order_items;
                DROP POLICY IF EXISTS "Enable authenticated order_items select" ON public.order_items;
                DROP POLICY IF EXISTS "Enable authenticated order_items update" ON public.order_items;
                CREATE POLICY "Enable authenticated order_items insert"
                ON public.order_items FOR INSERT TO authenticated WITH CHECK (true);
                CREATE POLICY "Enable authenticated order_items select"
                ON public.order_items FOR SELECT TO authenticated USING (true);
                CREATE POLICY "Enable authenticated order_items update"
                ON public.order_items FOR UPDATE TO authenticated USING (true);
                GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE public.order_items TO authenticated;
            `);
            await client.end();
            break;
        } catch (err: any) {
            results.push({ region: r, error: err.message });
            if (err.message.includes('password authentication failed') || err.message.includes('autenticación')) {
                foundRegion = r;
                errorDetail = `Tenant found in ${r} but password auth failed: ${err.message}`;
                await client.end();
                break;
            }
        }
    }

    return NextResponse.json({
        success: foundRegion !== null && !errorDetail,
        foundRegion,
        errorDetail,
        results
    });
}
