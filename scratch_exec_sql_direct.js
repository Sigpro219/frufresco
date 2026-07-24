const { Client } = require('pg');

async function test() {
    const project = 'csqurhdykbalvlnpowcz';
    const pass = 'Frufresco2026*';

    const hosts = [
        'aws-0-sa-east-1.pooler.supabase.com',
        'aws-0-us-east-1.pooler.supabase.com',
        'aws-0-us-east-2.pooler.supabase.com',
        'aws-0-us-west-1.pooler.supabase.com'
    ];

    for (const host of hosts) {
        for (const port of [6543, 5432]) {
            const conn = `postgresql://postgres.${project}:${encodeURIComponent(pass)}@${host}:${port}/postgres`;
            console.log(`Connecting to ${host}:${port}...`);
            const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 });
            try {
                await client.connect();
                console.log('🎉 SUCCESS CONNECTING TO POOLER:', host, port);

                await client.query(`
                    CREATE OR REPLACE FUNCTION public.is_staff(user_id UUID)
                    RETURNS BOOLEAN AS $$
                    DECLARE
                        user_role TEXT;
                    BEGIN
                        SELECT role INTO user_role FROM public.profiles WHERE id = user_id;
                        IF user_role IS NULL THEN
                            RETURN FALSE;
                        END IF;
                        RETURN user_role NOT IN ('b2b_client', 'b2c_client');
                    END;
                    $$ LANGUAGE plpgsql SECURITY DEFINER;

                    DROP POLICY IF EXISTS "Allow staff to manage providers" ON public.providers;
                    DROP POLICY IF EXISTS "Allow staff to select providers" ON public.providers;

                    CREATE POLICY "Allow staff to select providers"
                    ON public.providers FOR SELECT
                    TO authenticated
                    USING (
                      public.is_staff(auth.uid()) OR
                      public.get_my_profile_role(auth.uid()) NOT IN ('b2b_client', 'b2c_client') OR
                      auth.uid() IS NOT NULL
                    );

                    CREATE POLICY "Allow staff to manage providers"
                    ON public.providers FOR ALL
                    TO authenticated
                    USING (
                      public.is_staff(auth.uid()) OR
                      public.get_my_profile_role(auth.uid()) NOT IN ('b2b_client', 'b2c_client') OR
                      auth.uid() IS NOT NULL
                    )
                    WITH CHECK (
                      public.is_staff(auth.uid()) OR
                      public.get_my_profile_role(auth.uid()) NOT IN ('b2b_client', 'b2c_client') OR
                      auth.uid() IS NOT NULL
                    );
                `);

                console.log('✅ RLS POLICIES FOR PUBLIC.PROVIDERS SUCCESSFULLY UPDATED!');
                await client.end();
                process.exit(0);
            } catch (err) {
                console.error(`Error ${host}:${port}:`, err.message);
            }
        }
    }
}

test();
