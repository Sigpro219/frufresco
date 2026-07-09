const dns = require('dns');
dns.resolve('db.csqurhdykbalvlnpowcz.supabase.co', (err, records) => {
  console.log('A/AAAA records:', records);
});
dns.resolveCname('db.csqurhdykbalvlnpowcz.supabase.co', (err, addresses) => {
  console.log('CNAME addresses:', addresses);
});
