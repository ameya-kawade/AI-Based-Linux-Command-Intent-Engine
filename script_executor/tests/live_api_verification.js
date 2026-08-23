const http = require('http');

const makePostRequest = (endpoint, payload) => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(
      `http://localhost:3000${endpoint}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, body });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
};

const makeGetRequest = (endpoint) => {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:3000${endpoint}`, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
  });
};

async function runLiveVerification() {
  console.log('--- 1. Testing GET /api/health ---');
  const healthRes = await makeGetRequest('/api/health');
  console.log('Health Status:', healthRes.statusCode, healthRes.body.status, 'Docker Available:', healthRes.body.docker?.available);

  console.log('\n--- 2. Testing POST /api/analyze (Benign Script) ---');
  const benignRes = await makePostRequest('/api/analyze', {
    script: 'echo "=== Benign Test ==="; uname -a; whoami',
  });
  console.log('Benign Status:', benignRes.statusCode, benignRes.body.status);
  console.log('Output:\n', benignRes.body.script_output);
  console.log('Tracee Alerts Count:', benignRes.body.tracee_alerts?.length);

  console.log('\n--- 3. Testing POST /api/analyze (Timeout Test - 10s strict kill) ---');
  const timeoutStart = Date.now();
  const timeoutRes = await makePostRequest('/api/analyze', {
    script: 'echo "Entering infinite loop..."; while true; do sleep 1; done',
  });
  const timeoutDuration = (Date.now() - timeoutStart) / 1000;
  console.log(`Timeout Result (${timeoutDuration.toFixed(2)}s):`, timeoutRes.statusCode, timeoutRes.body.status);
  console.log('Timed Out Flag:', timeoutRes.body.metadata?.timed_out);
  console.log('Error Message:', timeoutRes.body.error);
  console.log('Output:', timeoutRes.body.script_output);

  console.log('\n--- Live API Verification Completed Successfully ---');
}

runLiveVerification().catch(console.error);
