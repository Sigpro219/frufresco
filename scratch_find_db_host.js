const { Client } = require('pg');

const hostsToTest = [
    'aws-0-sa-east-1.pooler.supabase.com',
    'aws-0-us-east-1.pooler.supabase.com',
    'aws-0-us-east-2.pooler.supabase.com',
    'aws-0-us-west-1.pooler.supabase.com',
    'aws-0-us-west-2.pooler.supabase.com',
    'aws-0-ca-central-1.pooler.supabase.com',
    'aws-0-eu-west-1.pooler.supabase.com',
    'gcp-0-us-east4.pooler.supabase.com',
    'gcp-0-us-central1.pooler.supabase.com',
    'gcp-0-southamerica-east1.pooler.supabase.com'
];

async function testConnection() {
    const project = 'csqurhdykbalvlnpowcz';
    const pass = 'Frufresco2026*';

    for (const host of hostsToTest) {
        // Try user postgres.csqurhdykbalvlnpowcz and postgres
        for (const user of [`postgres.${project}`, `postgres`]) {
            for (const port of [6543, 5432]) {
                const connectionString = `postgresql://${user}:${pass}@${host}:${port}/postgres`;
                console.log(`Testing ${host}:${port} with user ${user}...`);
                const client = new Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 3000 });
                try {
                    await client.connect();
                    console.log(`🎉 SUCCESS! Connected to host: ${host}, port: ${port}, user: ${user}`);

                    console.log('Running RLS policy fix for public.providers table...');
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
                } catch (e) {
                    // console.error(`Failed ${host}:${port}:`, e.message);
                }
            }
        }
    }
    console.error('All hosts failed.');
}

testConnection();
