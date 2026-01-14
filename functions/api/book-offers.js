let modPromise;

async function loadModule() {
  if (!modPromise) {
    modPromise = import("./book_offers.cjs");
  }
  return modPromise;
}

export async function onRequestGet(context) {
  const mod = await loadModule();
  return mod.onRequestGet(context);
}

export async function onRequestPost(context) {
  const mod = await loadModule();
  return mod.onRequestPost(context);
}
