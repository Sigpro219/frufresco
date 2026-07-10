import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';

export async function GET(req: NextRequest) {
    const project = 'csqurhdykbalvlnpowcz';
    const dbPass = 'Frufresco2026*';
    
    // We use the direct host on port 5432 which Vercel can resolve and connect to via IPv6
    const connectionString = `postgresql://postgres:${dbPass}@db.${project}.supabase.co:5432/postgres`;
    
    console.log("[Run SQL] Connecting to Supabase database...");
    const client = new Client({ 
        connectionString,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        console.log("[Run SQL] Connected successfully!");
        
        console.log("[Run SQL] Running query to add missing columns to 'mail'...");
        await client.query(`
            ALTER TABLE mail ADD COLUMN IF NOT EXISTS payload JSONB;
            ALTER TABLE mail ADD COLUMN IF NOT EXISTS sender_email TEXT;
        `);
        
        const res = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'mail';
        `);
        
        await client.end();
        
        return NextResponse.json({
            success: true,
            message: "Missing columns 'payload' and 'sender_email' added to 'mail' table successfully.",
            columns: res.rows
        });
    } catch (err: any) {
        console.error("[Run SQL] Error executing migration:", err);
        try {
            await client.end();
        } catch (_) {}
        return NextResponse.json({
            success: false,
            error: err.message,
            stack: err.stack
        }, { status: 500 });
    }
}
