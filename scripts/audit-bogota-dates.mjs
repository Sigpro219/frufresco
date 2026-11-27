#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const EXCLUDED_FILES = new Set([
    'src/lib/dateUtils.ts',
    'src/lib/orders/bogotaDateParser.ts',
]);

async function runTestWorker() {
    const dateUtilsUrl = pathToFileURL(path.join(ROOT_DIR, 'src/lib/dateUtils.ts')).href;
    const {
        getBogotaDateString,
        parseBogotaDate,
        formatBogotaDate,
        addBogotaDays,
        getBogotaDayRangeUtcIso,
        diffBogotaDays,
    } = await import(dateUtilsUrl);

    const tz = process.env.TZ || 'system';

    // 1. Late-night Bogota timestamps that are already next-day in UTC
    assert.equal(getBogotaDateString('2026-11-26T23:59:00-05:00'), '2026-11-26', `[${tz}] 23:59-05:00 must stay 2026-11-26`);
    assert.equal(getBogotaDateString('2026-11-26T19:01:00-05:00'), '2026-11-26', `[${tz}] 19:01-05:00 must stay 2026-11-26`);
    assert.equal(getBogotaDateString('2026-11-27T04:59:59Z'), '2026-11-26', `[${tz}] 04:59:59Z is 23:59:59-05:00 in Bogota`);
    assert.equal(getBogotaDateString('2026-11-27T05:00:00Z'), '2026-11-27', `[${tz}] 05:00:00Z is 00:00:00-05:00 in Bogota`);

    // 2. Date-only string passthrough without UTC shift
    assert.equal(getBogotaDateString('2026-12-01'), '2026-12-01', `[${tz}] date-only passthrough`);
    assert.equal(getBogotaDateString(''), '', `[${tz}] empty string`);

    // 3. parseBogotaDate at Bogota noon (12:00:00-05:00 = 17:00:00Z, TZ-invariant)
    const parsed = parseBogotaDate('2026-12-01');
    assert.equal(parsed.toISOString(), '2026-12-01T17:00:00.000Z', `[${tz}] parseBogotaDate invariant ISO`);
    assert.equal(getBogotaDateString(parsed), '2026-12-01', `[${tz}] round-trip parseBogotaDate`);
    assert.throws(() => getBogotaDayRangeUtcIso(''), /Invalid Bogotá date/, `[${tz}] invalid range throws`);

    // 4. addBogotaDays across month/year boundaries
    assert.equal(addBogotaDays('2026-11-30', 1), '2026-12-01', `[${tz}] add +1 across month`);
    assert.equal(addBogotaDays('2026-12-01', -1), '2026-11-30', `[${tz}] add -1 across month`);
    assert.equal(addBogotaDays('2026-01-01', -1), '2025-12-31', `[${tz}] add -1 across year`);

    // 5. diffBogotaDays
    assert.equal(diffBogotaDays('2026-11-30', '2026-12-01'), 1, `[${tz}] diff +1`);
    assert.equal(diffBogotaDays('2026-12-01', '2026-11-30'), -1, `[${tz}] diff -1`);
    assert.equal(
        diffBogotaDays('2026-11-26T23:59:00-05:00', '2026-11-27T00:01:00-05:00'),
        1,
        `[${tz}] diff across Bogota midnight`
    );

    // 6. getBogotaDayRangeUtcIso
    const range = getBogotaDayRangeUtcIso('2026-11-26');
    assert.deepEqual(range, {
        startUtcIso: '2026-11-26T05:00:00.000Z',
        endUtcIso: '2026-11-27T04:59:59.999Z',
    }, `[${tz}] getBogotaDayRangeUtcIso`);

    // 7. formatBogotaDate
    const fmtDateOnly = formatBogotaDate('2026-12-01', { day: '2-digit', month: '2-digit', year: 'numeric' });
    assert.match(fmtDateOnly, /01.*12.*2026/, `[${tz}] formatBogotaDate date-only: ${fmtDateOnly}`);

    const fmtLateNight = formatBogotaDate('2026-11-26T23:59:00-05:00', { day: '2-digit', month: '2-digit', year: 'numeric' });
    assert.match(fmtLateNight, /26.*11.*2026/, `[${tz}] formatBogotaDate late-night: ${fmtLateNight}`);

    assert.equal(formatBogotaDate(null, undefined, 'N/A'), 'N/A', `[${tz}] formatBogotaDate null fallback`);
    assert.equal(formatBogotaDate('', undefined), '---', `[${tz}] formatBogotaDate empty fallback`);
    assert.equal(formatBogotaDate('not-a-date'), '---', `[${tz}] formatBogotaDate invalid fallback`);

    // 8. Null / undefined / invalid safety (Goldfish hardening)
    assert.equal(getBogotaDateString(null), '', `[${tz}] getBogotaDateString null`);
    assert.equal(getBogotaDateString(new Date('invalid')), '', `[${tz}] getBogotaDateString invalid Date`);
    assert.ok(Number.isNaN(diffBogotaDays(null, '2026-11-26')), `[${tz}] diffBogotaDays null`);
    assert.ok(Number.isNaN(diffBogotaDays(undefined, '2026-11-26')), `[${tz}] diffBogotaDays undefined`);
    assert.ok(Number.isNaN(diffBogotaDays('', '2026-11-26')), `[${tz}] diffBogotaDays empty`);
    assert.equal(addBogotaDays(null, 5), '', `[${tz}] addBogotaDays null`);
    assert.equal(addBogotaDays(undefined, 5), '', `[${tz}] addBogotaDays undefined`);
    assert.equal(addBogotaDays('2026-11-26', NaN), '', `[${tz}] addBogotaDays NaN days`);
    assert.throws(() => getBogotaDayRangeUtcIso(null), /Invalid Bogotá date/, `[${tz}] getBogotaDayRangeUtcIso null`);
    assert.throws(() => getBogotaDayRangeUtcIso(undefined), /Invalid Bogotá date/, `[${tz}] getBogotaDayRangeUtcIso undefined`);

    console.log(`PASS [TZ=${tz}] all Dual-TZ assertions passed.`);
}

function runDualTzTests() {
    for (const tz of ['UTC', 'America/Bogota']) {
        execFileSync(process.execPath, [__filename, '--test-worker'], {
            cwd: ROOT_DIR,
            env: { ...process.env, TZ: tz },
            stdio: 'inherit',
        });
    }
    console.log('ALL DUAL-TZ TESTS PASSED (TZ=UTC & TZ=America/Bogota).');
}

function collectFiles(targetPath) {
    const abs = path.resolve(ROOT_DIR, targetPath);
    if (!fs.existsSync(abs)) return [];
    const stat = fs.statSync(abs);
    if (stat.isFile()) return [abs];

    const results = [];
    const stack = [abs];
    while (stack.length > 0) {
        const dir = stack.pop();
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === '.next') continue;
                stack.push(full);
            } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
                results.push(full);
            }
        }
    }
    return results;
}

function scanFile(absPath) {
    const relPath = path.relative(ROOT_DIR, absPath).replace(/\\/g, '/');
    if (EXCLUDED_FILES.has(relPath)) return [];

    const content = fs.readFileSync(absPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const violations = [];

    for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1;
        const line = lines[i];
        if (/bogota-audit-ignore/.test(line)) continue;
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

        const windowText = lines.slice(i, Math.min(lines.length, i + 5)).join(' ');

        // Clase A1: raw .toISOString().split('T')[0] or .toISOString().slice(0, 10)
        if (/\.toISOString\(\)\.(split\(['"]T['"]\)\[0\]|slice\(0,\s*10\))/.test(line)) {
            violations.push({ file: relPath, line: lineNum, code: 'A1', snippet: trimmed });
        }

        // Clase A2: raw UTC day bounds T00:00:00(.000)?Z or T23:59:59(.999)?Z
        if (/T(00:00:00(\.000)?|23:59:59(\.999)?)Z['"`]/.test(line)) {
            violations.push({ file: relPath, line: lineNum, code: 'A2', snippet: trimmed });
        }

        // Clase B1: raw toLocaleDateString / toLocaleTimeString, or new Date(...).toLocaleString / toLocaleString with DateTimeFormat options without America/Bogota
        const hasDateLocaleMethod = /\.toLocale(?:Date|Time)String\s*\(/.test(line) || /new\s+Date\([^;]*\)\.toLocaleString\s*\(/.test(line);
        const hasDateTimeLocaleOpts = /\.toLocaleString\s*\([^)]*\{[^}]*\b(?:year|month|day|weekday|hour|minute|second|hour12|dateStyle|timeStyle)\b/.test(windowText);
        if ((hasDateLocaleMethod || hasDateTimeLocaleOpts) && !/America\/Bogota/.test(windowText)) {
            violations.push({ file: relPath, line: lineNum, code: 'B1', snippet: trimmed });
        }

        // Clase A3: date-only columns (start_date / valid_until / delivery_date) written via new Date(...).toISOString()
        if (/(start_date|valid_until|delivery_date|closing_date)\s*:\s*[^,\n]*new\s+Date\([^)]*\)\.toISOString\(\)/.test(line)) {
            violations.push({ file: relPath, line: lineNum, code: 'A3', snippet: trimmed });
        }

        // Clase A4: Supabase range filters passing new Date(...).toISOString() directly
        if (/\.(gte|lte|gt|lt)\([^;]*new\s+Date\([^;]*\)\.toISOString\(\)/.test(line)) {
            violations.push({ file: relPath, line: lineNum, code: 'A4', snippet: trimmed });
        }

        // Clase B2: local midnight without timezone offset (T00:00:00 without Z or -05:00)
        if (/T00:00:00['"`]/.test(line) && !/T00:00:00(?:\.000)?(?:Z|-05:00)/.test(line)) {
            violations.push({ file: relPath, line: lineNum, code: 'B2', snippet: trimmed });
        }

        // Clase C: Intl.DateTimeFormat without America/Bogota or raw setHours/setUTCHours(0,0,0,0) / (23,59,59)
        if (/new\s+Intl\.DateTimeFormat\s*\(/.test(line) && !/America\/Bogota/.test(windowText)) {
            violations.push({ file: relPath, line: lineNum, code: 'C', snippet: trimmed });
        } else if (/\.(setHours|setUTCHours)\(\s*(?:0\s*,\s*0\s*,\s*0\s*,\s*0|23\s*,\s*59\s*,\s*59)/.test(line)) {
            violations.push({ file: relPath, line: lineNum, code: 'C', snippet: trimmed });
        }
    }

    return violations;
}

function runScan(args) {
    const jsonMode = args.includes('--json');
    const targets = args.filter((a) => !a.startsWith('--'));
    const scanTargets = targets.length > 0 ? targets : ['src'];

    const files = scanTargets.flatMap(collectFiles);
    const violations = files.flatMap(scanFile);

    if (jsonMode) {
        console.log(JSON.stringify({
            filesScanned: files.length,
            totalViolations: violations.length,
            violations,
        }, null, 2));
    } else {
        console.log(`Scanned ${files.length} files. Found ${violations.length} violation(s).`);
        for (const v of violations) {
            console.log(`  [${v.code}] ${v.file}:${v.line} -> ${v.snippet}`);
        }
    }

    process.exit(violations.length > 0 ? 1 : 0);
}

const args = process.argv.slice(2);
if (args.includes('--test-worker')) {
    await runTestWorker();
} else if (args.includes('--test')) {
    runDualTzTests();
} else {
    runScan(args);
}
