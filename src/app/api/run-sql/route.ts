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
            
            console.log("[Run SQL] Running query to update profiles RLS policies for commercial staff...");
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

                DROP POLICY IF EXISTS "Allow staff to select all profiles" ON public.profiles;
                DROP POLICY IF EXISTS "Allow staff to manage profiles" ON public.profiles;

                CREATE POLICY "Allow staff to select all profiles" 
                ON public.profiles FOR SELECT 
                TO authenticated, anon
                USING (
                  public.is_staff(auth.uid()) OR
                  public.get_my_profile_role(auth.uid()) NOT IN ('b2b_client', 'b2c_client') OR
                  auth.uid() = id
                );

                CREATE POLICY "Allow staff to manage profiles" 
                ON public.profiles FOR ALL 
                TO authenticated
                USING (
                  public.is_staff(auth.uid()) OR
                  public.get_my_profile_role(auth.uid()) NOT IN ('b2b_client', 'b2c_client') OR
                  auth.uid() = id
                )
                WITH CHECK (
                  public.is_staff(auth.uid()) OR
                  public.get_my_profile_role(auth.uid()) NOT IN ('b2b_client', 'b2c_client') OR
                  auth.uid() = id
                );
            `);
            
            const res = await client.query(`
                SELECT policyname 
                FROM pg_policies 
                WHERE tablename = 'profiles';
            `);
            
            await client.end();
            
            return NextResponse.json({
                success: true,
                message: "Profiles RLS policies updated successfully for staff and commercial team.",
                host: activeHost,
                policies: res.rows
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
