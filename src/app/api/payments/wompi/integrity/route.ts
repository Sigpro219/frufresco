import { NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Genera la firma de integridad SHA256 requerida por Wompi
 * Documentación: https://docs.wompi.co/docs/es/integracion-actual#firmado-de-la-transaccion
 * Estructura: cadena = referencia + monto_en_centavos + moneda + secreto_de_integridad
 */
export async function POST(request: Request) {
    try {
        const { reference, amountInCents, currency = 'COP' } = await request.json();
        // Usa la clave del entorno o una de prueba para desarrollo local
        const integritySecret = process.env.WOMPI_INTEGRITY_SECRET || 'test_integrity_secret_123456';

        if (!integritySecret) {
            return NextResponse.json(
                { error: 'WOMPI_INTEGRITY_SECRET not configured' },
                { status: 500 }
            );
        }

        // Concatenar valores para la firma
        const signatureString = `${reference}${amountInCents}${currency}${integritySecret}`;

        // Generar hash SHA256
        const hash = crypto
            .createHash('sha256')
            .update(signatureString)
            .digest('hex');

        return NextResponse.json({ hash });
    } catch (error: any) {
        console.error('Integrity Hash Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
