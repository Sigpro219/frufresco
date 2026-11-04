const fs = require('fs');
let code = fs.readFileSync('src/lib/specialClientAttention.ts', 'utf8');

const targetRegex = /if\s*\(explicitConfig\s*&&\s*explicitConfig\.active\s*===\s*false\)\s*\{\s*return null;\s*\}/;

const replacement = `if (explicitConfig && (explicitConfig.active === false || explicitConfig.mode === 'disabled')) {
        return null;
    }

    // Si está configurado explícitamente en modo manual activo
    if (explicitConfig && explicitConfig.active === true && (explicitConfig.mode === 'manual' || explicitConfig.is_manual)) {
        const rawReason = explicitConfig.reason || 'custom';
        const reason: SpecialAttentionReason = rawReason === 'custom' ? 'recurring_pqr' : rawReason;
        const shortTagMap: Record<string, 'NUE' | 'PQR' | 'SEG'> = {
            new_client: 'NUE',
            recurring_pqr: 'PQR',
            low_consumption: 'SEG',
            custom: 'PQR'
        };
        const titleMap: Record<string, string> = {
            new_client: 'Cliente Nuevo (Manual)',
            recurring_pqr: 'Alerta de Calidad / PQR (Manual)',
            low_consumption: 'Seguimiento por Bajo Consumo (Manual)',
            custom: 'Atención Especial Requerida'
        };
        const shortTag = shortTagMap[rawReason] || 'PQR';
        const title = explicitConfig.title || titleMap[rawReason] || 'Atención Especial';
        const subtitle = explicitConfig.custom_notes || explicitConfig.subtitle || 'Instrucción operativa manual para bodega y logística.';

        const activeDirectives = STANDARD_CARE_DIRECTIVES.filter(d => {
            if (explicitConfig.directives && typeof explicitConfig.directives === 'object') {
                return explicitConfig.directives[d.key] !== false;
            }
            return true;
        });

        const palette = REASON_PALETTES[reason] || REASON_PALETTES.recurring_pqr;

        return {
            active: true,
            isActive: true,
            reason,
            code: reason,
            shortTag,
            badgeShort: \`\${shortTag} · MANUAL\`,
            printStamp: shortTag,
            printCode: shortTag,
            title,
            subtitle,
            reasonText: subtitle,
            currentProgress: 1,
            targetProgress: 1,
            progressLabel: 'MANUAL',
            colors: palette,
            directives: activeDirectives.length > 0 ? activeDirectives : STANDARD_CARE_DIRECTIVES
        };
    }`;

if (targetRegex.test(code)) {
    code = code.replace(targetRegex, replacement);
    fs.writeFileSync('src/lib/specialClientAttention.ts', code, 'utf8');
    console.log('Successfully patched specialClientAttention.ts with regex');
} else {
    console.error('Target regex not found in specialClientAttention.ts');
}
