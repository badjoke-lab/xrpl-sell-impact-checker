import { validateUsagePayload } from '../../shared/usage-metrics-policy.js';

const MAX_BODY_BYTES = 2048;
const SYNTHETIC_HEADER = 'x-xsic-synthetic';

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-xsic-synthetic',
    },
  });
}

function getDb(env) {
  return env?.XSIC_DB || env?.DB || null;
}

function bucketKeys(now = new Date()) {
  const hour = new Date(now);
  hour.setUTCMinutes(0, 0, 0);
  return {
    bucketHour: hour.toISOString(),
    dayKey: hour.toISOString().slice(0, 10),
    updatedAt: now.toISOString(),
  };
}

function counters(outcome) {
  return {
    request: 1,
    success: outcome === 'success' ? 1 : 0,
    degraded: outcome === 'degraded' ? 1 : 0,
    error: outcome === 'error' ? 1 : 0,
  };
}

async function upsert(db, table, bucketColumn, bucketValue, event) {
  const count = counters(event.outcome);
  const sql = `
    INSERT INTO ${table} (
      ${bucketColumn}, event_name, feature_name, pair_key_hash,
      request_count, success_count, degraded_count, error_count, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (${bucketColumn}, event_name, feature_name, pair_key_hash)
    DO UPDATE SET
      request_count = request_count + excluded.request_count,
      success_count = success_count + excluded.success_count,
      degraded_count = degraded_count + excluded.degraded_count,
      error_count = error_count + excluded.error_count,
      updated_at = excluded.updated_at
  `;
  return db.prepare(sql).bind(
    bucketValue,
    event.eventName,
    event.featureName,
    event.pairKeyHash,
    count.request,
    count.success,
    count.degraded,
    count.error,
    event.updatedAt,
  );
}

export async function onRequestOptions() {
  return json({ ok: true, recorded: false }, 204);
}

export async function onRequestPost({ request, env }) {
  const syntheticHeader = request.headers.get(SYNTHETIC_HEADER) === '1';
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return json({ ok: false, error: 'payload_too_large' }, 413);

  let text = '';
  try {
    text = await request.text();
  } catch {
    return json({ ok: false, error: 'invalid_body' }, 400);
  }
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: 'payload_too_large' }, 413);
  }

  let body;
  try {
    body = JSON.parse(text || '{}');
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const validation = validateUsagePayload(body);
  if (!validation.ok) return json({ ok: false, error: validation.error }, 400);

  const event = validation.value;
  if (syntheticHeader || event.synthetic) {
    return json({ ok: true, recorded: false, reason: 'synthetic' }, 202);
  }

  const db = getDb(env);
  if (!db) {
    return json({ ok: true, recorded: false, reason: 'metrics_unavailable' }, 202);
  }

  const buckets = bucketKeys();
  const normalized = { ...event, updatedAt: buckets.updatedAt };

  try {
    const hourly = await upsert(db, 'usage_metric_hourly', 'bucket_hour', buckets.bucketHour, normalized);
    const daily = await upsert(db, 'usage_metric_daily', 'day_key', buckets.dayKey, normalized);
    if (typeof db.batch === 'function') {
      await db.batch([hourly, daily]);
    } else {
      await hourly.run();
      await daily.run();
    }
    return json({ ok: true, recorded: true }, 202);
  } catch {
    return json({ ok: true, recorded: false, reason: 'metrics_unavailable' }, 202);
  }
}

export async function onRequest() {
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
