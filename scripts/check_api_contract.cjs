const fs = require('node:fs');
const source = fs.readFileSync('functions/api/_contract.cjs', 'utf8');
const required = [
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
const missing = required.filter((name) => !source.includes(name));
if (missing.length) {
  console.error(`Missing API contract exports: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('API contract surface check passed.');
