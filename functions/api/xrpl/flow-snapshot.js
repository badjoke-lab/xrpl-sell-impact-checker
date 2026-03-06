import { onRequestGet as whaleFlowHandler } from './whale-flow.js';
import { onRequestGet as escrowWatchHandler } from './escrow-watch.js';
import { normalizeFlowAlertSnapshot } from '../../../shared/flow-alert-history.js';
import { appendSnapshot } from '../../../shared/flow-alert-history-store.js';

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function normalizeWindow(rawWindow) {
  if (rawWindow === '5m' || rawWindow === '1h' || rawWindow === '24h' || rawWindow === '7d') return rawWindow;
  return '1h';
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const preset = url.searchParams.get('preset') || 'exchanges';
  const window = normalizeWindow(url.searchParams.get('window'));
  const persist = url.searchParams.get('persist') === '1';

  const flowRequest = new Request(`https://local/api/xrpl/whale-flow?preset=${encodeURIComponent(preset)}&window=${encodeURIComponent(window)}`);
  const escrowRequest = new Request(`https://local/api/xrpl/escrow-watch?window=${encodeURIComponent(window)}&limit=10`);

  const [flowResponse, escrowResponse] = await Promise.all([
    whaleFlowHandler({ request: flowRequest }),
    escrowWatchHandler({ request: escrowRequest }),
  ]);

  const flow = await flowResponse.json();
  const escrow = await escrowResponse.json();
  const snapshot = normalizeFlowAlertSnapshot({ flow, escrow, preset, window });

  if (persist) {
    await appendSnapshot(snapshot);
  }

  return json({ ok: true, snapshot, persisted: persist });
}
