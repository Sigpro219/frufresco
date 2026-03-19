import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export async function POST() {
    try {
        console.log('--- INICIANDO ACTUALIZACIÓN MASIVA ---');
        
        // 1. Guardar cambios locales si existen y limpiar CORE
        const { stdout: status } = await execPromise('git status --porcelain');
        if (status) {
            await execPromise('git add . && git commit -m "chore: auto-save before mass sync"');
        }

        // 2. Propagar CORE -> Showcase (white-label)
        console.log('Syncing white-label...');
        await execPromise('git checkout white-label && git merge CORE -m "Sync: Core Update" && git push origin white-label');
        
        // 3. Propagar CORE -> Tenant Frufresco
        console.log('Syncing tenant-frufresco...');
        await execPromise('git checkout tenant-frufresco && git merge CORE -m "Sync: Core Update" && git push origin tenant-frufresco');

        // 4. Volver al CORE
        await execPromise('git checkout CORE');

        return NextResponse.json({ 
            success: true, 
            message: 'Aplicación actualizada en todas las ramas y desplegada exitosamente.' 
        });

    } catch (error: any) {
        console.error('Command Center Sync Error:', error.message);
        // Intentar volver al CORE pase lo que pase para no romper el entorno
        try { await execPromise('git checkout CORE'); } catch(e) {}
        
        return NextResponse.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
}
