const CACHE_CONTROL = 'no-store';
const ALLOWED_TOP = new Set([10, 20, 50]);
const ALLOWED_INTERVAL = new Set([5, 10]);
const ALLOWED_METRIC = new Set(['volume', 'share']);
const MINUTES_PER_DAY = 24 * 60;

const PAGE_META = {
  id: 'day-flow',
  provider: 'twitch',
  market: 'twitch-only',
  language: 'en',
  controls: {
    day: ['today', 'yesterday', 'date'],
    top: [10, 20, 50],
    metric: ['volume', 'share'],
    interval: [5, 10],
    others: 'required',
    focus: 'minute-window',
  },
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': CACHE_CONTROL,
    },
  });
}

function parseDateInput(rawDay) {
  const now = new Date();
  const day = (rawDay || 'today').toLowerCase();
  if (day === 'today') {
    return { dayKey: now.toISOString().slice(0, 10), day: 'today' };
  }
  if (day === 'yesterday') {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    return { dayKey: d.toISOString().slice(0, 10), day: 'yesterday' };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { dayKey: day, day: 'date' };
  }
  return { dayKey: now.toISOString().slice(0, 10), day: 'today' };
}

function parseIntParam(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseControls(url) {
  const parsedDay = parseDateInput(url.searchParams.get('day'));
  const top = parseIntParam(url.searchParams.get('top'), 10);
  const interval = parseIntParam(url.searchParams.get('interval'), 5);
  const metric = (url.searchParams.get('metric') || 'volume').toLowerCase();

  const focusStart = Math.max(0, parseIntParam(url.searchParams.get('focus_start'), 0));
  const focusEnd = Math.min(MINUTES_PER_DAY, Math.max(focusStart, parseIntParam(url.searchParams.get('focus_end'), MINUTES_PER_DAY)));

  return {
    day: parsedDay.day,
    dayKey: parsedDay.dayKey,
    top: ALLOWED_TOP.has(top) ? top : 10,
    interval: ALLOWED_INTERVAL.has(interval) ? interval : 5,
    metric: ALLOWED_METRIC.has(metric) ? metric : 'volume',
    focusStart,
    focusEnd,
  };
}

function minuteOfDay(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const iso = Date.parse(value);
  if (!Number.isNaN(iso)) {
    const d = new Date(iso);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }
  const m = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function normalizeRow(raw) {
  const bucketMinute = minuteOfDay(raw.bucket_minute ?? raw.bucketMinute ?? raw.minute_of_day ?? raw.bucket_start ?? raw.window_start ?? raw.ts_bucket);
  const channelId = String(raw.channel_id ?? raw.channelId ?? raw.streamer_id ?? raw.entity_id ?? raw.name ?? raw.channel ?? '').trim();
  const channelName = String(raw.channel_name ?? raw.channelName ?? raw.streamer_name ?? raw.entity_name ?? raw.display_name ?? raw.name ?? channelId ?? 'Unknown').trim();
  const viewers = Number(raw.viewers ?? raw.viewer_count ?? raw.volume ?? raw.metric_volume ?? 0);
  const activity = Number(raw.activity ?? raw.activity_count ?? raw.events ?? raw.messages ?? 0);

  if (!Number.isFinite(bucketMinute) || bucketMinute < 0) return null;
  if (!channelId) return null;
  return {
    bucketMinute,
    channelId,
    channelName,
    viewers: Number.isFinite(viewers) ? Math.max(0, viewers) : 0,
    activity: Number.isFinite(activity) ? Math.max(0, activity) : 0,
  };
}

async function queryRows(db, controls) {
  const attempts = [
    {
      sql: `
        SELECT bucket_minute, channel_id, channel_name, viewers, activity
        FROM day_flow_rollups
        WHERE day_key = ?1 AND interval_min = ?2
        ORDER BY bucket_minute ASC
      `,
      bind: [controls.dayKey, controls.interval],
    },
    {
      sql: `
        SELECT bucket_minute, channel_id, channel_name, viewers, activity
        FROM twitch_day_flow_rollups
        WHERE day_key = ?1 AND interval_min = ?2
        ORDER BY bucket_minute ASC
      `,
      bind: [controls.dayKey, controls.interval],
    },
    {
      sql: `
        SELECT minute_of_day as bucket_minute, channel_id, channel_name, viewers, activity
        FROM day_flow_snapshots
        WHERE day_key = ?1 AND interval_min = ?2
        ORDER BY minute_of_day ASC
      `,
      bind: [controls.dayKey, controls.interval],
    },
    {
      sql: `
        SELECT
          (CAST(strftime('%H', ts) AS INTEGER) * 60)
          + ((CAST(strftime('%M', ts) AS INTEGER) / ?2) * ?2) AS bucket_minute,
          channel_id,
          MAX(channel_name) as channel_name,
          AVG(viewers) as viewers,
          SUM(activity) as activity
        FROM twitch_snapshots
        WHERE date(ts) = ?1
        GROUP BY bucket_minute, channel_id
        ORDER BY bucket_minute ASC
      `,
      bind: [controls.dayKey, controls.interval],
    },
    {
      sql: `
        SELECT
          (CAST(strftime('%H', captured_at) AS INTEGER) * 60)
          + ((CAST(strftime('%M', captured_at) AS INTEGER) / ?2) * ?2) AS bucket_minute,
          channel_id,
          MAX(channel_name) as channel_name,
          AVG(viewers) as viewers,
          SUM(activity) as activity
        FROM twitch_snapshot_rollup
        WHERE date(captured_at) = ?1
        GROUP BY bucket_minute, channel_id
        ORDER BY bucket_minute ASC
      `,
      bind: [controls.dayKey, controls.interval],
    },
  ];

  const errors = [];
  for (const attempt of attempts) {
    try {
      const result = await db.prepare(attempt.sql).bind(...attempt.bind).all();
      if (Array.isArray(result?.results)) {
        return { rows: result.results, matchedQuery: attempt.sql.trim() };
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'd1_query_failed');
    }
  }

  return { rows: [], errors };
}

function buildDayFlow(rows, controls, sourceMeta) {
  const normalized = rows.map(normalizeRow).filter(Boolean);
  const focused = normalized.filter((row) => row.bucketMinute >= controls.focusStart && row.bucketMinute <= controls.focusEnd);

  if (!focused.length) {
    return {
      state: 'empty',
      page: PAGE_META,
      source: sourceMeta,
      controls,
      summary: {
        buckets: 0,
        entities: 0,
        totalViewers: 0,
        totalActivity: 0,
      },
      series: [],
      entities: [],
      focus: { from: controls.focusStart, to: controls.focusEnd },
    };
  }

  const byEntity = new Map();
  const byBucket = new Map();

  for (const row of focused) {
    const entity = byEntity.get(row.channelId) || { id: row.channelId, name: row.channelName, viewers: 0, activity: 0 };
    entity.viewers += row.viewers;
    entity.activity += row.activity;
    byEntity.set(row.channelId, entity);

    const bucketKey = String(row.bucketMinute);
    const bucket = byBucket.get(bucketKey) || { minute: row.bucketMinute, totalViewers: 0, totalActivity: 0, byEntity: new Map() };
    bucket.totalViewers += row.viewers;
    bucket.totalActivity += row.activity;

    const perEntity = bucket.byEntity.get(row.channelId) || { id: row.channelId, name: row.channelName, viewers: 0, activity: 0 };
    perEntity.viewers += row.viewers;
    perEntity.activity += row.activity;
    bucket.byEntity.set(row.channelId, perEntity);

    byBucket.set(bucketKey, bucket);
  }

  const topEntities = [...byEntity.values()]
    .sort((a, b) => b.viewers - a.viewers)
    .slice(0, controls.top);
  const topSet = new Set(topEntities.map((entity) => entity.id));

  const buckets = [...byBucket.values()].sort((a, b) => a.minute - b.minute).map((bucket) => {
    let othersViewers = 0;
    let othersActivity = 0;

    const lines = [];
    for (const entity of topEntities) {
      const row = bucket.byEntity.get(entity.id);
      const viewers = row?.viewers ?? 0;
      const activity = row?.activity ?? 0;
      lines.push({
        id: entity.id,
        name: entity.name,
        viewers,
        activity,
        share: bucket.totalViewers > 0 ? viewers / bucket.totalViewers : 0,
        value: controls.metric === 'share' ? (bucket.totalViewers > 0 ? viewers / bucket.totalViewers : 0) : viewers,
        isOthers: false,
      });
    }

    for (const row of bucket.byEntity.values()) {
      if (!topSet.has(row.id)) {
        othersViewers += row.viewers;
        othersActivity += row.activity;
      }
    }

    lines.push({
      id: 'others',
      name: 'Others',
      viewers: othersViewers,
      activity: othersActivity,
      share: bucket.totalViewers > 0 ? othersViewers / bucket.totalViewers : 0,
      value: controls.metric === 'share' ? (bucket.totalViewers > 0 ? othersViewers / bucket.totalViewers : 0) : othersViewers,
      isOthers: true,
    });

    const hour = String(Math.floor(bucket.minute / 60)).padStart(2, '0');
    const minute = String(bucket.minute % 60).padStart(2, '0');

    return {
      bucketMinute: bucket.minute,
      bucketLabel: `${hour}:${minute}`,
      totalViewers: bucket.totalViewers,
      totalActivity: bucket.totalActivity,
      lines,
    };
  });

  const totalViewers = buckets.reduce((sum, bucket) => sum + bucket.totalViewers, 0);
  const totalActivity = buckets.reduce((sum, bucket) => sum + bucket.totalActivity, 0);

  return {
    state: sourceMeta.mode === 'real' ? (controls.day === 'today' ? 'live' : 'complete') : 'demo',
    page: PAGE_META,
    source: sourceMeta,
    controls,
    summary: {
      buckets: buckets.length,
      entities: topEntities.length + 1,
      totalViewers,
      totalActivity,
    },
    series: buckets,
    entities: [
      ...topEntities.map((entity) => ({
        id: entity.id,
        name: entity.name,
        viewers: entity.viewers,
        activity: entity.activity,
      })),
      { id: 'others', name: 'Others', viewers: null, activity: null },
    ],
    focus: { from: controls.focusStart, to: controls.focusEnd },
  };
}

function buildDemoRows(controls) {
  const entityNames = ['alpha_live', 'beta_cast', 'gamma_fps', 'delta_chill', 'epsilon_esports', 'zeta_music'];
  const rows = [];
  for (let minute = 0; minute < 24 * 60; minute += controls.interval) {
    for (let i = 0; i < entityNames.length; i += 1) {
      const wave = Math.sin((minute / 1440) * Math.PI * 2 + i / 2) + 1.2;
      const viewers = Math.round(150 + wave * 120 + (i === 0 ? 130 : 0));
      const activity = Math.round(viewers * (0.05 + (i % 3) * 0.01));
      rows.push({
        bucket_minute: minute,
        channel_id: entityNames[i],
        channel_name: entityNames[i],
        viewers,
        activity,
      });
    }
  }
  return rows;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const controls = parseControls(url);
  const db = context.env?.DAY_FLOW_DB || context.env?.DB || null;

  if (!db) {
    const payload = buildDayFlow(buildDemoRows(controls), controls, {
      mode: 'demo',
      provider: 'twitch',
      reason: 'd1_binding_missing',
      asOf: new Date().toISOString(),
    });
    return json(payload);
  }

  const queried = await queryRows(db, controls);

  if (!queried.rows.length) {
    const isQueryError = Array.isArray(queried.errors) && queried.errors.length > 0;
    const fallback = buildDayFlow(buildDemoRows(controls), controls, {
      mode: 'demo',
      provider: 'twitch',
      reason: isQueryError ? 'd1_query_failed' : 'no_real_rows',
      errors: queried.errors || [],
      asOf: new Date().toISOString(),
    });
    fallback.state = isQueryError ? 'error' : 'demo';
    fallback.meta = { realRows: 0 };
    return json(fallback);
  }

  const payload = buildDayFlow(queried.rows, controls, {
    mode: 'real',
    provider: 'twitch',
    table: 'rollup',
    asOf: new Date().toISOString(),
  });
  payload.meta = { realRows: queried.rows.length };
  if (queried.errors?.length) {
    payload.warnings = queried.errors;
    payload.state = 'partial';
  }

  return json(payload);
}
