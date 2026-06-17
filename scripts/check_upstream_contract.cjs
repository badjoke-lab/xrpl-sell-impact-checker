const fs = require('node:fs');

const upstream = fs.readFileSync('functions/api/_upstream.cjs', 'utf8');
const rpc = fs.readFileSync('functions/api/_rpc.cjs', 'utf8');
const book = fs.readFileSync('functions/api/book_offers.cjs', 'utf8');

const requiredUpstream = [
  'DEFAULT_TIMEOUT_MS',
  'DEFAULT_MAX_RESPONSE_BYTES',
  'DEFAULT_RETRIES',
  'unexpected_content_type',
  'response_too_large',
  'invalid_json',
  'timeout',
  'fetchJsonWithRetry',
];
const missingUpstream = requiredUpstream.filter((name) => !upstream.includes(name));
if (missingUpstream.length) {
  console.error(`Missing upstream protections: ${missingUpstream.join(', ')}`);
  process.exit(1);
}

const requiredRpc = ['fetchJsonWithRetry', 'contentType', 'retryCount', 'cache-fallback', 'Promise.any'];
const missingRpc = requiredRpc.filter((name) => !rpc.includes(name));
if (missingRpc.length) {
  console.error(`Missing RPC protections: ${missingRpc.join(', ')}`);
  process.exit(1);
}

for (const forbidden of ['_raw', 'text.slice(0, 200)']) {
  if (upstream.includes(forbidden) || rpc.includes(forbidden)) {
    console.error(`Raw upstream body retention is forbidden: ${forbidden}`);
    process.exit(1);
  }
}

for (const marker of ['state:', 'sourceMode:', 'upstreamStatus:', 'status: 502']) {
  if (!book.includes(marker)) {
    console.error(`Book offers response is missing ${marker}`);
    process.exit(1);
  }
}

console.log('Upstream contract checks passed.');
