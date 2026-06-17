export function onRequest(context) {
  const requestId = context.request.headers.get('x-request-id') || context.request.headers.get('cf-ray') || `xsic-${Date.now()}`;
  const body = {
    ok: false,
    error: {
      code: 'api_route_not_found',
      message: 'The requested API route does not exist.',
      field: null,
      details: null,
      retryable: false,
    },
    meta: {
      contract: 'xsic.error.v1',
      requestId,
      source: 'api-fallback',
      observedAt: new Date().toISOString(),
    },
  };
  return new Response(JSON.stringify(body), {
    status: 404,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'x-request-id': requestId,
    },
  });
}
