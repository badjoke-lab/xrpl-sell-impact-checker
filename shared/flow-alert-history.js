function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toEventTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeFlowAlertSnapshot({ flow, escrow, preset, window }) {
  const flowSummary = flow?.summary || {};
  const flowDebug = flow?.debug || {};
  const escrowStats = escrow?.stats || null;
  const firstEvent = (flow?.events || [])[0] || null;

  return {
    ts: Date.now(),
    preset,
    window,
    source: flow?.source || 'unknown',
    stale: Boolean(flow?.stale || escrow?.stale),
    staleReason: flow?.staleReason || escrow?.staleReason || null,
    summary: {
      inflowXrp: asNumber(flowSummary.inflowXrp),
      outflowXrp: asNumber(flowSummary.outflowXrp),
      netXrp: asNumber(flowSummary.netXrp),
      inflowUsd: Number.isFinite(flowSummary.inflowUsd) ? Number(flowSummary.inflowUsd) : null,
      outflowUsd: Number.isFinite(flowSummary.outflowUsd) ? Number(flowSummary.outflowUsd) : null,
      netUsd: Number.isFinite(flowSummary.netUsd) ? Number(flowSummary.netUsd) : null,
    },
    metrics: {
      paymentsScanned: asNumber(flowDebug.paymentsCount),
      ledgersScanned: asNumber(flowDebug.ledgersScanned),
      matchedEvents: (flow?.events || []).length,
      rpcCalls: asNumber(flowDebug.rpcCalls) + asNumber(escrow?.debug?.rpcCalls),
    },
    latestEvent: firstEvent ? {
      time: toEventTime(firstEvent.time) || Date.now(),
      label: firstEvent.label || 'Unknown',
      dir: firstEvent.dir || 'XFER',
      amountXrp: asNumber(firstEvent.amountXrp),
      reason: firstEvent.reason || '',
    } : null,
    escrow: {
      nextAmountXrp: Number.isFinite(escrow?.next?.amountXrp) ? Number(escrow.next.amountXrp) : null,
      recentCount: Array.isArray(escrow?.recent) ? escrow.recent.length : 0,
      stats: escrowStats ? {
        sumXrp: asNumber(escrowStats.sumXrp),
        count: asNumber(escrowStats.count),
        avgXrp: asNumber(escrowStats.avgXrp),
        maxXrp: asNumber(escrowStats.maxXrp),
      } : null,
    },
    debugSummary: {
      strategy: flowDebug.strategy || 'n/a',
      degradeLevel: flowDebug.degradeLevel || 'none',
      warningCount: Array.isArray(flowDebug.warnings) ? flowDebug.warnings.length : 0,
    },
  };
}

export function buildDeltaSummary(latest, previous) {
  if (!latest || !previous) {
    return {
      inflowXrpDelta: null,
      outflowXrpDelta: null,
      netXrpDelta: null,
      matchedEventsDelta: null,
    };
  }

  return {
    inflowXrpDelta: asNumber(latest.summary?.inflowXrp) - asNumber(previous.summary?.inflowXrp),
    outflowXrpDelta: asNumber(latest.summary?.outflowXrp) - asNumber(previous.summary?.outflowXrp),
    netXrpDelta: asNumber(latest.summary?.netXrp) - asNumber(previous.summary?.netXrp),
    matchedEventsDelta: asNumber(latest.metrics?.matchedEvents) - asNumber(previous.metrics?.matchedEvents),
  };
}

