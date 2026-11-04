const fs = require('fs');

function normalizeNewlines(str) {
  return str.replace(/\r\n/g, '\n');
}

// 1. Patch src/lib/authContext.tsx
let authContext = fs.readFileSync('src/lib/authContext.tsx', 'utf8');
const isCrlfCtx = authContext.includes('\r\n');
let normCtx = normalizeNewlines(authContext);

const oldCtx = `        if (target.startsWith(cleanRule + '.') || target.startsWith(cleanRule + ':')) return true;
        if (cleanRule.startsWith(target + '.') || cleanRule.startsWith(target + ':')) return true;
        if ((cleanRule === 'admin.commercial.clients' || cleanRule.startsWith('admin.commercial.clients.')) && target.startsWith('admin.clients')) return true;`;

const newCtx = `        if (target.startsWith(cleanRule + '.') || target.startsWith(cleanRule + ':')) return true;
        if ((cleanRule === 'admin.commercial.clients' || cleanRule.startsWith('admin.commercial.clients.')) && target.startsWith('admin.clients')) return true;`;

if (!normCtx.includes(oldCtx)) {
  console.error('Could not find oldCtx snippet');
  process.exit(1);
}

normCtx = normCtx.replace(oldCtx, newCtx);
authContext = isCrlfCtx ? normCtx.replace(/\n/g, '\r\n') : normCtx;
fs.writeFileSync('src/lib/authContext.tsx', authContext, 'utf8');
console.log('src/lib/authContext.tsx patched successfully');

// 2. Patch src/lib/auth.ts
let authTs = fs.readFileSync('src/lib/auth.ts', 'utf8');
const isCrlfTs = authTs.includes('\r\n');
let normTs = normalizeNewlines(authTs);

const oldTsMatches = `      if (target.startsWith(cleanRule + '.') || target.startsWith(cleanRule + ':')) return true;
      if (cleanRule.startsWith(target + '.') || cleanRule.startsWith(target + ':')) return true;
      if ((cleanRule === 'admin.commercial.clients' || cleanRule.startsWith('admin.commercial.clients.')) && target.startsWith('admin.clients')) return true;`;

const newTsMatches = `      if (target.startsWith(cleanRule + '.') || target.startsWith(cleanRule + ':')) return true;
      if ((cleanRule === 'admin.commercial.clients' || cleanRule.startsWith('admin.commercial.clients.')) && target.startsWith('admin.clients')) return true;`;

if (!normTs.includes(oldTsMatches)) {
  console.error('Could not find oldTsMatches snippet');
  process.exit(1);
}

normTs = normTs.replace(oldTsMatches, newTsMatches);

const oldTsAllow = `    // 4. Check explicit allows (prefix '+' or no prefix)
    const hasAllow = userPerms.some(p => !p.startsWith('-') && matches(p, requiredPermission));`;

const newTsAllow = `    // 4. Check explicit allows (prefix '+' or no prefix)
    const hasAllow = userPerms.some(p => {
      if (p.startsWith('-')) return false;
      const cleanP = p.replace(/^[+]/, '');
      if (matches(p, requiredPermission)) return true;
      if (cleanP.startsWith(requiredPermission + '.') || cleanP.startsWith(requiredPermission + ':')) return true;
      return false;
    });`;

normTs = normTs.replace(oldTsAllow, newTsAllow);

const oldRoleAllow = `        const hasRoleAllow = rolePermissions.some((p: string) => matches(p, requiredPermission));`;
const newRoleAllow = `        const hasRoleAllow = rolePermissions.some((p: string) => {
          if (matches(p, requiredPermission)) return true;
          const cleanP = p.replace(/^[+]/, '');
          if (cleanP.startsWith(requiredPermission + '.') || cleanP.startsWith(requiredPermission + ':')) return true;
          return false;
        });`;

normTs = normTs.replace(oldRoleAllow, newRoleAllow);

authTs = isCrlfTs ? normTs.replace(/\n/g, '\r\n') : normTs;
fs.writeFileSync('src/lib/auth.ts', authTs, 'utf8');
console.log('src/lib/auth.ts patched successfully');
