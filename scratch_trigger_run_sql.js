const http = require('http');

function triggerPort(port) {
    return new Promise((resolve) => {
        console.log(`Sending GET request to http://localhost:${port}/api/run-sql ...`);
        http.get(`http://localhost:${port}/api/run-sql`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`[Port ${port} Response]:`, data.slice(0, 300));
                resolve(data);
            });
        }).on('error', (err) => {
            console.log(`[Port ${port} Error]:`, err.message);
            resolve(null);
        });
    });
}

async function run() {
    await triggerPort(3000);
    await triggerPort(3001);
}

run();
