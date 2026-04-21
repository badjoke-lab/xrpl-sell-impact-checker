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

function resolveAccount(url) {
  return (
    url.searchParams.get('issuer') ||
    url.searchParams.get('address') ||
    url.searchParams.get('account') ||
    ''
  ).trim();
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const account = resolveAccount(url);

  if (!account) {
    return json({ ok: false, error: 'missing_account' }, 400);
  }

  const payload = {
    method: 'account_info',
    params: [{ account, ledger_index: 'validated' }],
  };

  try {
    const { body, endpoint } = await fetchFromAnyEndpoint(payload);
    const accountData =
      body?.result?.account_data ||
      body?.result?.result?.account_data ||
      body?.account_data ||
      null;

    if (!accountData) {
      return json({
        ...body,
        ok: false,
        endpointUsed: endpoint,
        error: body?.result?.error || 'account_data_unavailable',
      }, 404);
    }

    return json({
      ...body,
      ok: true,
      endpointUsed: endpoint,
    });
  } catch (error) {
    return json({
      ok: false,
      endpointUsed: null,
      error: error?.message || 'upstream_unreachable',
    }, error?.message === 'upstream_timeout' ? 504 : 502);
  }
}
