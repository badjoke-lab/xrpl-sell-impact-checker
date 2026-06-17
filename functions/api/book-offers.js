import contractModule from './_contract.cjs';

const contract = contractModule.default || contractModule;
let modPromise;

async function loadModule() {
  if (!modPromise) modPromise = import('./book_offers.cjs');
  return modPromise;
}

function invalidQuery(context) {
  const url = new URL(context.request.url);
  const checks = [
    contract.validateCurrency(url.searchParams.get('currency')),
    contract.validateIssuer(url.searchParams.get('issuer')),
    contract.validateInteger(url.searchParams.get('limit'), { field: 'limit', defaultValue: 200, min: 1, max: 200 }),
  ];
  const issue = contract.firstValidationError(checks);
  if (!issue) return null;
  return contract.errorResponse({
    status: 400,
    code: issue.code,
    message: issue.message,
    field: issue.field,
    details: issue.details,
    requestId: contract.requestIdFrom(context.request),
    source: 'book-offers',
  });
}

export async function onRequestGet(context) {
  const invalid = invalidQuery(context);
  if (invalid) return invalid;
  const mod = await loadModule();
  return mod.onRequestGet(context);
}

export async function onRequestPost(context) {
  const parsed = await contract.readInput(context.request);
  if (!parsed.ok) {
    return contract.errorResponse({
      status: parsed.status,
      code: parsed.error.code,
      message: parsed.error.message,
      field: parsed.error.field,
      requestId: contract.requestIdFrom(context.request),
      source: 'book-offers',
    });
  }
  const url = new URL(context.request.url);
  url.searchParams.set('currency', parsed.input.currency || '');
  url.searchParams.set('issuer', parsed.input.issuer || '');
  url.searchParams.set('limit', parsed.input.limit || '200');
  const nextContext = {
    request: new Request(url.toString(), { method: 'GET', headers: context.request.headers }),
    env: context.env,
    params: context.params,
    data: context.data,
    waitUntil: context.waitUntil,
    next: context.next,
  };
  return onRequestGet(nextContext);
}
