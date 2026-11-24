/**
 * Portero Único de Conflictos de Acuerdos Comerciales (Escenario 480 — SDD v1.9.435).
 * Detecta acuerdos activos en conflicto entre acuerdos individuales y Listas Maestras,
 * y ejecuta limpieza atómica cross-canal para garantizar Fuente Única de Verdad.
 */

export interface AgreementConflict {
    clientId: string;
    clientName: string;
    existingQuoteId: string;
    existingQuoteNumber?: number | null;
    existingName: string;
    validUntil: string | null;
    channel: 'individual' | 'master';
}

export async function checkClientAgreementConflicts(
    supabase: any,
    clientIds: string[],
    excludeQuoteId?: string | null
): Promise<AgreementConflict[]> {
    const uniqueIds = Array.from(new Set((clientIds || []).filter(Boolean)));
    if (uniqueIds.length === 0) return [];

    const conflictsMap = new Map<string, AgreementConflict>();
    const addConflict = (c: AgreementConflict) => {
        if (excludeQuoteId && c.existingQuoteId === excludeQuoteId) return;
        const key = `${c.clientId}::${c.existingQuoteId}`;
        if (!conflictsMap.has(key)) {
            conflictsMap.set(key, c);
        }
    };

    const [quotesRes, profilesRes, modelClientsRes] = await Promise.all([
        supabase
            .from('quotes')
            .select('id, quote_number, client_id, client_name, model_snapshot_name, valid_until')
            .in('client_id', uniqueIds)
            .eq('status', 'agreement'),
        supabase
            .from('profiles')
            .select('id, company_name, contact_name, logistics_data')
            .in('id', uniqueIds),
        supabase
            .from('special_agreement_model_clients')
            .select('client_id, model_id')
            .in('client_id', uniqueIds),
    ]);

    const profNameMap = new Map<string, string>();
    (profilesRes.data || []).forEach((p: any) => {
        profNameMap.set(p.id, p.company_name || p.contact_name || p.id);
    });

    (quotesRes.data || []).forEach((q: any) => {
        if (!q.client_id) return;
        addConflict({
            clientId: q.client_id,
            clientName: profNameMap.get(q.client_id) || q.client_name || q.client_id,
            existingQuoteId: q.id,
            existingQuoteNumber: q.quote_number,
            existingName: q.model_snapshot_name || `Acuerdo #${q.quote_number || ''}`,
            validUntil: q.valid_until ? String(q.valid_until).split('T')[0] : null,
            channel: 'individual',
        });
    });

    const masterQuoteIds = new Set<string>();
    const masterLinks: Array<{ clientId: string; quoteId: string }> = [];

    (profilesRes.data || []).forEach((p: any) => {
        const mId = p.logistics_data?.active_master_agreement_id;
        if (typeof mId === 'string' && mId.trim() && mId.trim() !== excludeQuoteId) {
            masterQuoteIds.add(mId.trim());
            masterLinks.push({ clientId: p.id, quoteId: mId.trim() });
        }
    });

    const modelIds = Array.from(new Set((modelClientsRes.data || []).map((r: any) => r.model_id).filter(Boolean)));
    if (modelIds.length > 0) {
        const { data: sams } = await supabase
            .from('special_agreement_models')
            .select('id, name, master_quote_id, valid_until')
            .in('id', modelIds);
        const samById = new Map<string, any>((sams || []).map((s: any) => [s.id, s]));
        (modelClientsRes.data || []).forEach((mc: any) => {
            const sam = samById.get(mc.model_id);
            if (sam?.master_quote_id && sam.master_quote_id !== excludeQuoteId) {
                masterQuoteIds.add(sam.master_quote_id);
                masterLinks.push({ clientId: mc.client_id, quoteId: sam.master_quote_id });
            }
        });
    }

    if (masterQuoteIds.size > 0) {
        const { data: masterQuotes } = await supabase
            .from('quotes')
            .select('id, quote_number, client_name, model_snapshot_name, valid_until, status')
            .in('id', Array.from(masterQuoteIds))
            .eq('status', 'agreement');

        const mqById = new Map<string, any>((masterQuotes || []).map((q: any) => [q.id, q]));
        masterLinks.forEach((lnk) => {
            const mq = mqById.get(lnk.quoteId);
            if (!mq) return;
            addConflict({
                clientId: lnk.clientId,
                clientName: profNameMap.get(lnk.clientId) || lnk.clientId,
                existingQuoteId: mq.id,
                existingQuoteNumber: mq.quote_number,
                existingName: mq.model_snapshot_name || mq.client_name || `Lista Maestra #${mq.quote_number || ''}`,
                validUntil: mq.valid_until ? String(mq.valid_until).split('T')[0] : null,
                channel: 'master',
            });
        });
    }

    return Array.from(conflictsMap.values());
}

export function formatAgreementConflictPrompt(
    conflicts: AgreementConflict[],
    newAgreementLabel: string
): string {
    const preview = conflicts.slice(0, 8).map((c) => {
        const tipo = c.channel === 'master' ? 'Lista Maestra' : 'Acuerdo Individual';
        const vig = c.validUntil ? ` (vigente hasta ${c.validUntil})` : '';
        return `• ${c.clientName}: ${tipo} "${c.existingName}"${vig}`;
    });
    const extra = conflicts.length > 8 ? `\n...y ${conflicts.length - 8} cliente(s) más.` : '';
    return (
        `CONFLICTO DE ACUERDOS DETECTADO\n\n` +
        `Los siguientes clientes ya tienen un acuerdo activo que choca con "${newAgreementLabel}":\n\n` +
        `${preview.join('\n')}${extra}\n\n` +
        `¿Deseas REEMPLAZAR el acuerdo anterior (desactivando/desvinculando el previo automáticamente) o CANCELAR?`
    );
}

export async function cleanupConflictingAgreementsForClients(
    supabase: any,
    clientIds: string[],
    opts?: { keepQuoteId?: string | null; keepModelId?: string | null }
): Promise<void> {
    const uniqueIds = Array.from(new Set((clientIds || []).filter(Boolean)));
    if (uniqueIds.length === 0) return;

    const keepQuoteId = opts?.keepQuoteId || null;
    const keepModelId = opts?.keepModelId || null;

    // 1. Degradar acuerdos individuales previos a 'superseded' (jamás 'expired')
    let supQuery = supabase
        .from('quotes')
        .update({ status: 'superseded', updated_at: new Date().toISOString() })
        .in('client_id', uniqueIds)
        .eq('status', 'agreement');
    if (keepQuoteId) {
        supQuery = supQuery.neq('id', keepQuoteId);
    }
    const { error: supErr } = await supQuery;
    if (supErr) throw supErr;

    // 2. Limpiar punteros active_master_agreement_id / special_agreement_model_id en profiles si no coinciden
    const { data: profs, error: profFetchErr } = await supabase
        .from('profiles')
        .select('id, logistics_data')
        .in('id', uniqueIds);
    if (profFetchErr) throw profFetchErr;
    for (const p of profs || []) {
        const logData = { ...(p.logistics_data || {}) };
        const hasMasterMismatch = logData.active_master_agreement_id && logData.active_master_agreement_id !== keepQuoteId;
        const hasModelMismatch = logData.special_agreement_model_id && logData.special_agreement_model_id !== keepModelId;
        if (hasMasterMismatch || hasModelMismatch) {
            if (hasMasterMismatch) delete logData.active_master_agreement_id;
            if (hasModelMismatch) delete logData.special_agreement_model_id;
            const { error: profUpdErr } = await supabase.from('profiles').update({ logistics_data: logData }).eq('id', p.id);
            if (profUpdErr) throw profUpdErr;
        }
    }

    // 3. Limpiar registros cruzados en special_agreement_model_clients
    let samcDel = supabase
        .from('special_agreement_model_clients')
        .delete()
        .in('client_id', uniqueIds);
    if (keepModelId) {
        samcDel = samcDel.neq('model_id', keepModelId);
    }
    const { error: samcErr } = await samcDel;
    if (samcErr) throw samcErr;

    // 4. Remover clientIds de otras llaves agreement_clients:* en app_settings
    const { data: settingsRows, error: setFetchErr } = await supabase
        .from('app_settings')
        .select('key, value')
        .ilike('key', 'agreement_clients:%');
    if (setFetchErr) throw setFetchErr;

    const keepSettingKey = keepQuoteId ? `agreement_clients:${keepQuoteId}` : null;
    for (const row of settingsRows || []) {
        if (keepSettingKey && row.key === keepSettingKey) continue;
        try {
            const arr: string[] = JSON.parse(row.value || '[]');
            const filtered = arr.filter((id) => !uniqueIds.includes(id));
            if (filtered.length !== arr.length) {
                const { error: setUpdErr } = await supabase
                    .from('app_settings')
                    .update({ value: JSON.stringify(filtered), updated_at: new Date().toISOString() })
                    .eq('key', row.key);
                if (setUpdErr) throw setUpdErr;
            }
        } catch (err: any) {
            if (err?.message && !String(err.message).includes('JSON')) throw err;
        }
    }
}
