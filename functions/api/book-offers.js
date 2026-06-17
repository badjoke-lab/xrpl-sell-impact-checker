import contractModule from './_contract.cjs';
import { executeShared, normalizedContext } from './runtime_endpoint.js';

const contract = contractModule.default || contractModule;
let modPromise;

async function loadModule() {
  if (!modPromise) modPromise = import('./book_offers.cjs');
  return modPromise;
}

function validateInput(context, input) {
  const currency = contract.validateCurrency(input.currency);
  const issuer = contract.validateIssuer(input.issuer);
  const limit = contract.validateInteger(input.limit, { field: 'limit', defaultValue: 200, min: 1, max: 200 });
  const issue = contract.firstValidationError([currency, issuer, limit]);
  if (issue) {
    return {
      response: contract.errorResponse({
        status: 400,
        code: issue.code,
        message: issue.message,
        field: issue.field,
        details: issue.details,
        requestId: contract.requestIdFrom(context.request),
        source: 'book-offers',
      }),
    };
  }
  return {
    values: {
      currency: currency.value,
      issuer: issuer.value,
      limit: limit.value,
    },
  };
}

async function run(context, input) {
  const checked = validateInput(context, input);
  if (checked.response) return checked.response;
  const nextContext = normalizedContext(context, checked.values);
  return executeShared(nextContext, async () => {
    const mod = await loadModule();
    return mod.onRequestGet(nextContext);
  });
}

export async function onRequestGet(context) {
  const input = Object.fromEntries(new URL(context.request.url).searchParams.entries());
  return run(context, input);
}

export async function onRequestPost(context) {
  const parsed = await contract.readInput(context.request);
  if (!parsed.ok) {
    return contract.errorResponse({
      status: parsed.status,
      code: parsed.error.code,
      message: parsed.error.message,
      field: parsed.error.field,
      details: parsed.error.details,
      requestId: contract.requestIdFrom(context.request),
      source: 'book-offers',
    });
  }
  return run(context, parsed.input);
}
