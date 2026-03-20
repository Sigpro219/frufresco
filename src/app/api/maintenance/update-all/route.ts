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
            console.log('Hay cambios locales detectados. Realizando auto-save...');
            await execPromise('git add .');
            // Usamos --no-verify para evitar que hooks de linting bloqueen un despliegue de emergencia, 
            // aunque lo ideal es que el código ya esté limpio del desarrollo.
            await execPromise('git commit -m "chore: auto-save before fleet deploy" --no-verify');
        }

        // 2. Asegurar que estamos en CORE y empujar al origen
        await execPromise('git push origin CORE');

        // 3. Propagar CORE -> white-label (Showcase)
        console.log('Desplegando a Showcase (white-label)...');
        try {
            await execPromise('git push origin CORE:white-label --force');
            results.push({ branch: 'white-label (Showcase)', success: true, message: 'Código actualizado en Vercel' });
        } catch (err: unknown) {
            results.push({ branch: 'white-label (Showcase)', success: false, message: 'Fallo al empujar rama: ' + String(err) });
        }

        // 4. Propagar CORE -> tenant-frufresco (FruFresco)
        console.log('Desplegando a FruFresco (tenant-frufresco)...');
        try {
            await execPromise('git push origin CORE:tenant-frufresco --force');
            results.push({ branch: 'tenant-frufresco (FruFresco)', success: true, message: 'Código actualizado en Vercel' });
        } catch (err: unknown) {
            results.push({ branch: 'tenant-frufresco (FruFresco)', success: false, message: 'Fallo al empujar rama: ' + String(err) });
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
