const dns = require('dns');

function resolve(host) {
    dns.lookup(host, { all: true }, (err, addresses) => {
        if (err) console.error(`Error resolving ${host}:`, err.message);
        else console.log(`Addresses for ${host}:`, addresses);
    });
}

resolve('db.csqurhdykbalvlnpowcz.supabase.co');
resolve('csqurhdykbalvlnpowcz.supabase.co');
resolve('aws-0-us-east-1.pooler.supabase.com');
resolve('aws-0-sa-east-1.pooler.supabase.com');
