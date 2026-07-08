import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { verifySessionAndPermission } from '@/lib/auth';

const execPromise = promisify(exec);

export async function GET(request: Request) {
    try {
        const auth = await verifySessionAndPermission(request, 'admin.dashboard');
        if (!auth.authorized) {
            return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
        }

        const { stdout } = await execPromise('git branch --show-current');
        return NextResponse.json({ branch: stdout.trim() });
    } catch (error) {
        return NextResponse.json({ branch: 'Error', error: String(error) }, { status: 500 });
    }
}
