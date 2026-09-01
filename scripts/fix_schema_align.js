const fs = require('fs');

// Fix send-counter-offer route
let sendCounter = fs.readFileSync('src/app/api/commercial/send-counter-offer/route.ts', 'utf8');
sendCounter = sendCounter.replace(/proposal_type:\s*'commercial_agreement',?/g, "model_snapshot_name: 'Acuerdo Comercial (Contraoferta)',");
sendCounter = sendCounter.replace(/counter_summary:\s*\{[\s\S]*?\},?/g, '');
sendCounter = sendCounter.replace(/accounting_id:\s*item\.accounting_id\s*\|\|\s*null,?/g, '');
sendCounter = sendCounter.replace(/client_proposed_price:[\s\S]*?is_counter_offered:[^\n]*,?/g, '');
fs.writeFileSync('src/app/api/commercial/send-counter-offer/route.ts', sendCounter, 'utf8');

// Fix activate-agreement route
let activateAgree = fs.readFileSync('src/app/api/commercial/activate-agreement/route.ts', 'utf8');
activateAgree = activateAgree.replace(/proposal_type:\s*'commercial_agreement',?/g, "model_snapshot_name: 'Acuerdo Comercial',");
activateAgree = activateAgree.replace(/accounting_id:\s*item\.accounting_id\s*\|\|\s*null,?/g, '');
activateAgree = activateAgree.replace(/client_proposed_price:[\s\S]*?is_counter_offered:[^\n]*,?/g, '');
fs.writeFileSync('src/app/api/commercial/activate-agreement/route.ts', activateAgree, 'utf8');

console.log('✅ Updated API routes to align with PostgREST schema cache!');
