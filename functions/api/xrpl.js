const XRPL_ENDPOINTS = [
  'https://s1.ripple.com:51234/',
  'https://s2.ripple.com:51234/',
  'https://xrplcluster.com/',
];

const REQUEST_TIMEOUT_MS = 4500;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });
}

function errorPayload(error, endpoint = null) {
  return {
    ok: false,
    endpointUsed: endpoint,
    error: error?.message || 'upstream_unreachable',
  };
}

async function postRpc(endpoint, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`http_${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFromAnyEndpoint(payload) {
  let lastError = null;
  let timeoutSeen = false;

  for (const endpoint of XRPL_ENDPOINTS) {
    try {
      const body = await postRpc(endpoint, payload);
      return { body, endpoint };
    } catch (error) {
      lastError = error;
      if (error?.name === 'AbortError') timeoutSeen = true;
    }
  }

  const err = new Error(timeoutSeen ? 'upstream_timeout' : (lastError?.message || 'upstream_unreachable'));
  throw err;
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
    },
  });
}

export async function onRequestPost({ request }) {
  let payload = null;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  if (!payload || typeof payload !== 'object' || !payload.method) {
    return json({ ok: false, error: 'missing_method' }, 400);
  }

  try {
    const { body, endpoint } = await fetchFromAnyEndpoint(payload);
    return json({
      ...body,
      ok: true,
      endpointUsed: endpoint,
    });
  } catch (error) {
    return json(errorPayload(error), error?.message === 'upstream_timeout' ? 504 : 502);
  }
}
