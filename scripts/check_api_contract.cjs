const fs = require('node:fs');

const contractSource = fs.readFileSync('functions/api/_contract.cjs', 'utf8');
const requiredContractNames = [
  'xsic.error.v1',
  'validateCurrency',
  'validateIssuer',
  'validateAmount',
  'validateInteger',
  'validateWindow',
  'validatePreset',
  'validateIdentifier',
  'validatePair',
  'readInput',
  'errorResponse',
];
const missing = requiredContractNames.filter((name) => !contractSource.includes(name));
if (missing.length) {
  console.error(`Missing API contract exports: ${missing.join(', ')}`);
  process.exit(1);
}

for (const file of ['functions/api/book-offers.js', 'functions/api/amm-info.js']) {
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes("./_contract.cjs") || !source.includes('readInput') || !source.includes('errorResponse')) {
    console.error(`${file} is not wired to the shared API contract`);
    process.exit(1);
  }
}

const fallback = fs.readFileSync('functions/api/[[path]].js', 'utf8');
if (!fallback.includes('api_route_not_found') || !fallback.includes('application/json')) {
  console.error('API fallback route does not return the standard JSON error shape');
  process.exit(1);
}

console.log('API contract surface checks passed.');
