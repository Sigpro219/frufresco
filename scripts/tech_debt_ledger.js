#!/usr/bin/env node
/**
 * Gestor Dinámico de Deuda Técnica (Cola Viva SDD §43.2 & TECHNICAL_DEBT.md)
 * Uso:
 *   node scripts/tech_debt_ledger.js list
 *   node scripts/tech_debt_ledger.js close DT-01 "Resuelto en Escenario 338 (SDD v1.9.321)"
 *   node scripts/tech_debt_ledger.js add "🔴 **P0**" "**Módulo**" "**Título:** Detalle" "`archivo.ts`" "**~20 min**"
 */
const fs = require('fs');
const path = require('path');

const repoDir = path.resolve(__dirname, '..');
const specPath = path.join(repoDir, 'SPEC.md');
const debtPath = path.join(repoDir, 'TECHNICAL_DEBT.md');

function parseActiveDebts(content) {
  const lines = content.split(/\r?\n/);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\|\s*\*\*(DT-\d+)\*\*([^|]*)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/);
    if (m) {
      rows.push({
        lineIndex: i,
        rawLine: lines[i],
        id: m[1].trim(),
        alias: m[2].trim(),
        priority: m[3].trim(),
        module: m[4].trim(),
        description: m[5].trim(),
        files: m[6].trim(),
        effort: m[7].trim()
      });
    }
  }
  return rows;
}

function closeDebtInFile(filePath, id, resolutionNote) {
  let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  const lines = content.split('\n');
  const rowRegex = new RegExp(`^\\|\\s*\\*\\*${id}\\*\\*[^|]*\\|([^|]+)\\|([^|]+)\\|([^|]+)\\|`);
  let removedRow = null;

  const newLines = [];
  for (const line of lines) {
    const m = line.match(rowRegex);
    if (m && !removedRow) {
      removedRow = {
        module: m[2].trim().replace(/\*\*/g, ''),
        description: m[3].trim()
      };
      continue; // remove from active table
    }
    newLines.push(line);
  }

  if (!removedRow) {
    return false;
  }

  let updated = newLines.join('\n');
  const dateStr = new Date().toISOString().slice(0, 10);
  const archiveBullet = `- **${id} (${removedRow.module}):** ✅ Cerrado (${dateStr}) — ${resolutionNote}.`;

  if (updated.includes('### 43.3 Registro Histórico de Deudas Técnicas Cerradas y Certificadas (`✅`)')) {
    updated = updated.replace(
      '### 43.3 Registro Histórico de Deudas Técnicas Cerradas y Certificadas (`✅`)\n',
      `### 43.3 Registro Histórico de Deudas Técnicas Cerradas y Certificadas (\`✅\`)\n${archiveBullet}\n`
    );
  } else if (updated.includes('## 3. Registro Histórico de Deudas Técnicas Resueltas y Certificadas (`✅`)')) {
    updated = updated.replace(
      '## 3. Registro Histórico de Deudas Técnicas Resueltas y Certificadas (`✅`)\n',
      `## 3. Registro Histórico de Deudas Técnicas Resueltas y Certificadas (\`✅\`)\n\n${archiveBullet}`
    );
  }

  fs.writeFileSync(filePath, updated, 'utf8');
  return true;
}

function addDebtToFile(filePath, nextId, priority, moduleName, description, files, effort) {
  let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  const lines = content.split('\n');
  let lastDtIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\|\s*\*\*DT-\d+\*\*/.test(lines[i])) {
      lastDtIdx = i;
    }
  }
  if (lastDtIdx === -1) return false;
  const newRow = `| **${nextId}** | ${priority} | ${moduleName} | ${description} | ${files} | ${effort} | ⏳ Pendiente |`;
  lines.splice(lastDtIdx + 1, 0, newRow);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return true;
}

const [,, cmd, ...args] = process.argv;

if (!cmd || cmd === 'list') {
  const specContent = fs.readFileSync(specPath, 'utf8');
  const rows = parseActiveDebts(specContent);
  console.log(`\n=== COLA VIVA DE DEUDA TÉCNICA ACTIVA (${rows.length} pendientes en SPEC.md) ===`);
  console.table(rows.map(r => ({
    ID: r.id,
    Prioridad: r.priority.replace(/\*\*/g, ''),
    Modulo: r.module.replace(/\*\*/g, '').slice(0, 38),
    Esfuerzo: r.effort.replace(/\*\*/g, '')
  })));
} else if (cmd === 'close') {
  const [id, ...noteParts] = args;
  const note = noteParts.join(' ') || 'Resuelto y verificado en producción';
  if (!id || !/^DT-\d+$/i.test(id)) {
    console.error('Uso: node scripts/tech_debt_ledger.js close DT-XX "Nota de cierre"');
    process.exit(1);
  }
  const normId = id.toUpperCase();
  const okSpec = closeDebtInFile(specPath, normId, note);
  const okDebt = closeDebtInFile(debtPath, normId, note);
  console.log(`[Cola Viva SDD] ${normId} cerrada -> SPEC.md: ${okSpec ? 'OK' : 'No encontrada'}, TECHNICAL_DEBT.md: ${okDebt ? 'OK' : 'No encontrada'}`);
} else if (cmd === 'add') {
  const [priority, moduleName, description, files, effort] = args;
  const specContent = fs.readFileSync(specPath, 'utf8');
  const rows = parseActiveDebts(specContent);
  const maxNum = rows.reduce((max, r) => Math.max(max, parseInt(r.id.replace('DT-', ''), 10)), 10);
  const nextId = `DT-${String(maxNum + 1).padStart(2, '0')}`;
  addDebtToFile(specPath, nextId, priority, moduleName, description, files, effort || '**~25 min**');
  addDebtToFile(debtPath, nextId, priority, moduleName, description, files, effort || '**~25 min**');
  console.log(`[Cola Viva SDD] Añadida nueva deuda técnica ${nextId} en SPEC.md y TECHNICAL_DEBT.md.`);
}
