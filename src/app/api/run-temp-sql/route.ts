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
    let definition = null;
    let foundRegion = null;

    for (const r of regions) {
        const host = `aws-0-${r}.pooler.supabase.com`;
        const connectionString = `postgresql://postgres.csqurhdykbalvlnpowcz:postgres@${host}:6543/postgres`;
        const client = new Client({ connectionString, connectionTimeoutMillis: 3000 });
        try {
            await client.connect();
            foundRegion = r;
            const res = await client.query("select prosrc from pg_proc where proname = 'fn_audit_order_changes';");
            if (res.rows.length > 0) {
                definition = res.rows[0].prosrc;
            } else {
                definition = 'NOT_FOUND';
            }
            await client.end();
            break;
        } catch (err: any) {
            results.push({ region: r, error: err.message });
            if (err.message.includes('password authentication failed') || err.message.includes('autenticación')) {
                foundRegion = r;
                await client.end();
                break;
            }
        }
    }

    return NextResponse.json({
        success: foundRegion !== null,
        foundRegion,
        definition,
        results
    });
}
