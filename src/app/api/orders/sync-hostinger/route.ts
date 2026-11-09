import { NextResponse } from 'next/server';
import { syncHostingerChannel3Orders } from '@/lib/orders/hostingerImapSync';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get('force') === 'true';
    const result = await syncHostingerChannel3Orders({ force });
    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('[API /api/orders/sync-hostinger] Error:', err?.message || err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Error en /api/orders/sync-hostinger',
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}
