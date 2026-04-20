export const POPULAR_PAIRS = [
  {
    currency: 'USD',
    issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq',
    label: 'Bitstamp USD / XRP',
    rank: 1,
    enabled: true,
  },
  {
    currency: 'EUR',
    issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq',
    label: 'Bitstamp EUR / XRP',
    rank: 2,
    enabled: true,
  },
  {
    currency: 'BTC',
    issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq',
    label: 'Bitstamp BTC / XRP',
    rank: 3,
    enabled: true,
  },
  {
    currency: '534F4C4F00000000000000000000000000000000',
    issuer: 'rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz',
    label: 'SOLO / XRP',
    rank: 4,
    enabled: true,
  },
];

export function normalizePopularPair(row) {
  return {
    currency: String(row?.currency || '').trim().toUpperCase(),
    issuer: String(row?.issuer || '').trim(),
    label: String(row?.label || '').trim(),
    rank: Number.isFinite(Number(row?.rank)) ? Number(row.rank) : 999,
    enabled: row?.enabled !== false,
    pairKey: `${String(row?.currency || '').trim().toUpperCase()}|${String(row?.issuer || '').trim()}`,
  };
}

export function getPopularPairs() {
  return POPULAR_PAIRS.map(normalizePopularPair)
    .filter((row) => row.currency && row.issuer && row.enabled)
    .sort((a, b) => a.rank - b.rank || a.currency.localeCompare(b.currency));
}
