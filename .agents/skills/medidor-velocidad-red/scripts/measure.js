#!/usr/bin/env node
/**
 * Fast Network Speed Benchmark (Cloudflare CDN Edge)
 * Zero external dependencies. Uses native Node.js https.
 * Execution time: ~2-4 seconds.
 */

const https = require('https');

async function measurePing() {
    const targets = [
        'https://1.1.1.1',
        'https://8.8.8.8',
        'https://www.google.com/generate_204'
    ];
    const pings = [];

    await Promise.all(targets.map(url => {
        return new Promise(resolve => {
            const start = Date.now();
            const req = https.get(url, (res) => {
                res.resume();
                pings.push(Date.now() - start);
                resolve();
            });
            req.on('error', () => resolve());
            req.setTimeout(2000, () => { req.abort(); resolve(); });
        });
    }));

    if (pings.length === 0) return { avgPing: 0, minPing: 0, maxPing: 0 };
    const avg = pings.reduce((a, b) => a + b, 0) / pings.length;
    return {
        avgPing: Math.round(avg),
        minPing: Math.min(...pings),
        maxPing: Math.max(...pings)
    };
}

async function measureDownload(bytesTarget = 25000000) {
    const url = `https://speed.cloudflare.com/__down?bytes=${bytesTarget}`;
    const start = Date.now();
    let receivedBytes = 0;

    await new Promise((resolve) => {
        const req = https.get(url, (res) => {
            res.on('data', (chunk) => {
                receivedBytes += chunk.length;
            });
            res.on('end', resolve);
        });
        req.on('error', () => resolve());
        req.setTimeout(6000, () => { req.abort(); resolve(); });
    });

    const durationSec = (Date.now() - start) / 1000;
    if (durationSec <= 0 || receivedBytes === 0) return 0;
    const mbps = ((receivedBytes * 8) / (1024 * 1024)) / durationSec;
    return Number(mbps.toFixed(1));
}

async function measureUpload(bytesTarget = 5242880) { // 5 MB
    const buffer = Buffer.alloc(bytesTarget, '0');
    const start = Date.now();

    await new Promise((resolve) => {
        const req = https.request('https://speed.cloudflare.com/__up', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': bytesTarget
            }
        }, (res) => {
            res.resume();
            res.on('end', resolve);
        });

        req.on('error', () => resolve());
        req.setTimeout(6000, () => { req.abort(); resolve(); });
        req.write(buffer);
        req.end();
    });

    const durationSec = (Date.now() - start) / 1000;
    if (durationSec <= 0) return 0;
    const mbps = ((bytesTarget * 8) / (1024 * 1024)) / durationSec;
    return Number(mbps.toFixed(1));
}

async function runBenchmark() {
    const asJson = process.argv.includes('--json');
    const quick = process.argv.includes('--quick');

    const downloadTarget = quick ? 15000000 : 30000000;
    const uploadTarget = quick ? 2097152 : 5242880;

    // Parallel ping while warming up
    const pingPromise = measurePing();
    const downloadPromise = measureDownload(downloadTarget);
    
    const [pingRes, dlMbps] = await Promise.all([pingPromise, downloadPromise]);
    const ulMbps = await measureUpload(uploadTarget);

    const isSymmetric = Math.abs(dlMbps - ulMbps) < (Math.max(dlMbps, ulMbps) * 0.35);
    let quality = 'Excelente';
    if (dlMbps < 15) quality = 'Baja';
    else if (dlMbps < 40) quality = 'Media';
    else if (dlMbps < 80) quality = 'Buena';

    const result = {
        pingMs: pingRes.avgPing,
        minPingMs: pingRes.minPing,
        maxPingMs: pingRes.maxPing,
        downloadMbps: dlMbps,
        uploadMbps: ulMbps,
        isSymmetric,
        connectionType: isSymmetric ? 'Fibra Óptica Simétrica' : 'Banda Ancha Asimétrica (Cable/4G)',
        quality,
        timestamp: new Date().toISOString()
    };

    if (asJson) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log('\n========================================');
        console.log('⚡ REPORTE DE VELOCIDAD DE INTERNET');
        console.log('========================================');
        console.log(`🌐 Latencia (Ping):     ${result.pingMs} ms (Mín: ${result.minPingMs} ms / Máx: ${result.maxPingMs} ms)`);
        console.log(`📥 Descarga (Download): ${result.downloadMbps} Mbps`);
        console.log(`📤 Subida (Upload):     ${result.uploadMbps} Mbps`);
        console.log(`📡 Tipo de Conexión:    ${result.connectionType}`);
        console.log(`⭐ Calificación:        ${result.quality}`);
        console.log('========================================\n');
    }
}

runBenchmark();
