/**
 * Utilidad Universal de Guardado de Archivos con Diálogo Nativo "Guardar como..."
 * (File System Access API — window.showSaveFilePicker)
 *
 * Garantiza que el navegador SIEMPRE pregunte al usuario en qué carpeta desea
 * guardar el archivo (PDF o Excel .xlsx) y con qué nombre, evitando descargas
 * silenciosas en la carpeta por defecto o el paso por el diálogo de impresora.
 */

export interface SaveFilePickerConfig {
    suggestedName: string;
    description: string;
    mimeType: string;
    extension: `.${string}`;
}

export class SavePickerAbortedError extends Error {
    public readonly isUserAbort = true;
    constructor() {
        super('Guardado cancelado por el usuario.');
        this.name = 'SavePickerAbortedError';
    }
}

export function isSavePickerAborted(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    return (
        (err as any).isUserAbort === true ||
        (err as any).name === 'AbortError' ||
        (err as any).name === 'SavePickerAbortedError'
    );
}

/**
 * Abre INMEDIATAMENTE el diálogo nativo del sistema operativo "Guardar como..."
 * Debe invocarse al inicio del evento onClick (mientras la activación de usuario está activa).
 *
 * - Si el usuario cancela el diálogo, lanza `SavePickerAbortedError`.
 * - Si el navegador no soporta `showSaveFilePicker`, retorna `null` para usar fallback `<a download>`.
 */
export async function acquireSaveFileHandle(config: SaveFilePickerConfig): Promise<any | null> {
    if (typeof window === 'undefined') return null;
    const showSaveFilePickerFn = (window as any).showSaveFilePicker;
    if (typeof showSaveFilePickerFn !== 'function') {
        return null;
    }

    try {
        const handle = await showSaveFilePickerFn({
            suggestedName: config.suggestedName,
            types: [
                {
                    description: config.description,
                    accept: {
                        [config.mimeType]: [config.extension],
                    },
                },
            ],
        });
        return handle;
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            throw new SavePickerAbortedError();
        }
        // Si falla por políticas de seguridad o navegador no compatible, hacer fallback limpio
        console.warn('[fileSavePicker] showSaveFilePicker no disponible, usando descarga estándar:', err);
        return null;
    }
}

/**
 * Escribe un Blob en el FileSystemFileHandle seleccionado por el usuario,
 * o ejecuta descarga directa como fallback si el navegador no soporta showSaveFilePicker.
 */
export async function writeBlobToHandleOrFallback(
    blob: Blob,
    suggestedName: string,
    handle: any | null
): Promise<void> {
    if (handle && typeof handle.createWritable === 'function') {
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
    }

    // Fallback para navegadores sin File System Access API
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Guarda un libro de Excel (SheetJS WorkBook) preguntando SIEMPRE dónde guardar el archivo.
 * Si se pasa `preAcquiredHandle`, usa ese handle adquirido antes de operaciones asíncronas.
 */
export async function saveWorkbookWithPicker(
    XLSX: any,
    wb: any,
    suggestedName: string,
    preAcquiredHandle?: any
): Promise<boolean> {
    const cleanName = suggestedName.endsWith('.xlsx') ? suggestedName : `${suggestedName}.xlsx`;
    try {
        const handle =
            preAcquiredHandle !== undefined
                ? preAcquiredHandle
                : await acquireSaveFileHandle({
                      suggestedName: cleanName,
                      description: 'Libro de Microsoft Excel (.xlsx)',
                      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                      extension: '.xlsx',
                  });

        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

        await writeBlobToHandleOrFallback(blob, cleanName, handle);
        return true;
    } catch (err) {
        if (isSavePickerAborted(err)) {
            return false;
        }
        throw err;
    }
}
