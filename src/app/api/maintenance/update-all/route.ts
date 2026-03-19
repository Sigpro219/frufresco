import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export async function POST() {
    const results: { branch: string; success: boolean; message: string }[] = [];

    try {
        console.log('--- INICIANDO DEPLOY MASIVO DESDE CORE ---');

        // 1. Guardar cualquier cambio pendiente en CORE
        const { stdout: status } = await execPromise('git status --porcelain');
        if (status.trim()) {
            console.log('Hay cambios sin guardar, haciendo commit automático...');
            await execPromise('git add .');
            await execPromise('git commit -m "chore: auto-save before fleet deploy"');
        }

        // 2. Push CORE a origin/CORE
        await execPromise('git push origin CORE');

        // 3. Propagar CORE -> white-label SIN cambiar de rama
        // Esto envía el HEAD de CORE directamente a la rama remota white-label
        try {
            await execPromise('git push origin CORE:white-label --force');
            results.push({ branch: 'white-label (Showcase)', success: true, message: 'Deploy OK → Vercel redesplegando' });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            results.push({ branch: 'white-label (Showcase)', success: false, message: msg });
        }

        // 4. Propagar CORE -> tenant-frufresco SIN cambiar de rama
        try {
            await execPromise('git push origin CORE:tenant-frufresco --force');
            results.push({ branch: 'tenant-frufresco (FruFresco)', success: true, message: 'Deploy OK → Vercel redesplegando' });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            results.push({ branch: 'tenant-frufresco (FruFresco)', success: false, message: msg });
        }

        const allOk = results.every(r => r.success);

        return NextResponse.json({
            success: allOk,
            message: allOk
                ? 'Código desplegado en todas las instancias. Vercel redesplegará en ~60s.'
                : 'Algunos deploys fallaron. Revisa los detalles.',
            results
        });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Fleet Deploy Error:', message);
        return NextResponse.json({ success: false, error: message, results }, { status: 500 });
    }
}
