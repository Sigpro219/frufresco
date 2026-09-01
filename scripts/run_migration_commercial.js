const { Client } = require('pg');

async function run() {
    const project = 'csqurhdykbalvlnpowcz';
    const pass = 'Frufresco2026*';
    const hosts = [
        'aws-0-sa-east-1.pooler.supabase.com',
        'aws-0-us-east-1.pooler.supabase.com',
        'aws-0-us-east-2.pooler.supabase.com',
        'aws-0-us-west-1.pooler.supabase.com'
    ];

    const sql = `
-- 1. Fix Mail Table Constraints & Missing Columns
ALTER TABLE public.mail DROP CONSTRAINT IF EXISTS mail_status_check;
ALTER TABLE public.mail ADD CONSTRAINT mail_status_check 
  CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'received', 'read', 'replied', 'simulated', 'sandbox_sent', 'ignored', 'error', 'success'));

ALTER TABLE public.mail ADD COLUMN IF NOT EXISTS sender_email TEXT;
ALTER TABLE public.mail ADD COLUMN IF NOT EXISTS lead_id INTEGER REFERENCES public.leads(id) ON DELETE SET NULL;
ALTER TABLE public.mail ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb;

-- 2. Enhance quotes table for Multi-Version Agreements
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS mail_id UUID REFERENCES public.mail(id) ON DELETE SET NULL;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS parent_quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS proposal_type TEXT DEFAULT 'commercial_agreement';
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS counter_summary JSONB DEFAULT '{}'::jsonb;

-- 3. Enhance quote_items for 5-Column Pricing Comparison Matrix
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS accounting_id TEXT;
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS client_proposed_price NUMERIC DEFAULT 0;
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS last_applied_price NUMERIC DEFAULT 0;
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS general_institutional_price NUMERIC DEFAULT 0;
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS counter_price NUMERIC DEFAULT 0;
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS is_counter_offered BOOLEAN DEFAULT false;
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS observations TEXT;

-- 4. Enable RLS Policies for quotes and quote_items
DROP POLICY IF EXISTS "Allow authenticated manage quotes" ON public.quotes;
CREATE POLICY "Allow authenticated manage quotes" ON public.quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated manage quote items" ON public.quote_items;
CREATE POLICY "Allow authenticated manage quote items" ON public.quote_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated manage mail" ON public.mail;
CREATE POLICY "Allow authenticated manage mail" ON public.mail FOR ALL TO authenticated USING (true) WITH CHECK (true);
`;

    for (const host of hosts) {
        for (const port of [6543, 5432]) {
            const conn = 'postgresql://postgres.' + project + ':' + encodeURIComponent(pass) + '@' + host + ':' + port + '/postgres';
            console.log('Connecting to ' + host + ':' + port + '...');
            const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 6000 });
            try {
                await client.connect();
                console.log('🎉 Connected to PostgreSQL on ' + host + ':' + port);
                await client.query(sql);
                console.log('✅ Migration SQL executed successfully!');

                await client.query(`
                    INSERT INTO public.app_settings (key, value)
                    VALUES ('inbox_email_commercial', 'investcortes@gmail.com')
                    ON CONFLICT (key) DO UPDATE SET value = 'investcortes@gmail.com';

                    INSERT INTO public.app_settings (key, value)
                    VALUES ('inbox_email_orders', 'pedidos@frufresco.com')
                    ON CONFLICT (key) DO UPDATE SET value = 'pedidos@frufresco.com';
                `);
                console.log('✅ App settings updated for commercial and orders inboxes!');

                await client.end();
                process.exit(0);
            } catch (err) {
                console.error('Failed on ' + host + ':' + port + ': ' + err.message);
            }
        }
    }
}

run();
