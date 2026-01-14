import * as mod from "./book_offers.cjs";

export async function onRequestGet(context) {
  return mod.onRequestGet(context);
}

export async function onRequestPost(context) {
  return mod.onRequestPost(context);
}
