import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';

export async function GET(req: NextRequest) {
    const connectionString = 'postgresql://postgres.csqurhdykbalvlnpowcz:postgres@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
    const client = new Client({ connectionString });
    try {
        await client.connect();
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
        return NextResponse.json({ success: true, message: 'RLS policies applied successfully!' });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message });
    }
}
