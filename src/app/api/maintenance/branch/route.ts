import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export async function GET() {
    try {
        const { stdout } = await execPromise('git branch --show-current');
        return NextResponse.json({ branch: stdout.trim() });
    } catch (error) {
        return NextResponse.json({ branch: 'Error', error: String(error) }, { status: 500 });
    }
}
