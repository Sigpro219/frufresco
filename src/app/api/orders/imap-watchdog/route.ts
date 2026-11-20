import { NextResponse } from 'next/server';
import { runHostingerImapWatchdog } from '@/lib/orders/hostingerImapWatchdog';
import { isSandboxMode } from '@/lib/sandboxGuard';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: Request) {
  if (isSandboxMode()) {
    return NextResponse.json(
      { skipped: true, sandbox: true, missingCount: 0, recoveredCount: 0, missingSamples: [], reason: 'IMAP watchdog disabled in Sandbox mode' },
      { status: 200 }
    );
  }
  try {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get('force') === 'true';
    const autoRecover = searchParams.get('recover') !== 'false';
    const result = await runHostingerImapWatchdog({ force, autoRecover });
    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('[API /api/orders/imap-watchdog] Error:', err?.message || err);
    return NextResponse.json(
      {
        error: err?.message || 'Error en /api/orders/imap-watchdog',
        missingCount: 0,
        recoveredCount: 0,
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}
