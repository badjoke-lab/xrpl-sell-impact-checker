import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const commands = [
  ['node', ['scripts/check_reliability_baseline.mjs']],
  ['node', ['scripts/check_runtime_contract.cjs']],
  ['node', ['scripts/check_sell_impact_contract.cjs']],
  ['node', ['scripts/check_liquidity_pulse_contract.cjs']],
  ['node', ['scripts/check_flow_alert_contract.cjs']],
  ['node', ['scripts/check_exit_coverage_contract.cjs']],
  ['node', ['scripts/check_exposure_heatmap_contract.cjs']],
  ['node', ['scripts/check_privacy_zk_watch_contract.cjs']],
  ['node', ['scripts/check_proof_anchor_contract.cjs']],
  ['node', ['scripts/check_readiness_radar_contract.cjs']],
  ['node', ['scripts/check_health_ops_contract.cjs']],
  ['node', ['scripts/check_retention_security_contract.cjs']],
  ['node', ['scripts/check_accessibility_contract.cjs']],
  ['node', ['scripts/audit-seo.mjs']],
  ['node', ['scripts/check_directory_routes.cjs']],
];

const requiredFiles = [
  'functions/api/health.js',
  'functions/api/health-watchers.js',
  'functions/api/retention-policy.js',
  'functions/api/watch-sources.js',
  'functions/api/proof-anchor.js',
  'apps/privacy-zk-watch/index.html',
  'apps/proof-anchor-checker/index.html',
  'apps/institutional-readiness-radar/index.html',
  'docs/operations-runbook.md',
  'docs/retention-security-policy.md',
  'docs/sell-impact-source-contract.md',
  'docs/proof-anchor-source-contract.md',
];

const failures = [];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) failures.push(`missing required release file: ${file}`);
}

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  const label = `${command} ${args.join(' ')}`;
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.status !== 0) failures.push(`${label} exited with ${result.status}`);
}

const forbiddenCronFiles = ['wrangler.toml', 'wrangler.json', 'wrangler.jsonc']
  .filter((file) => fs.existsSync(file))
  .filter((file) => /\bcrons\b|\[\s*triggers\s*\]/i.test(fs.readFileSync(file, 'utf8')));
if (forbiddenCronFiles.length) failures.push(`Cloudflare scheduled triggers remain prohibited: ${forbiddenCronFiles.join(', ')}`);

if (failures.length) {
  console.error('Final release gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Final release gate passed: ${commands.length} contract commands and ${requiredFiles.length} required files.`);
