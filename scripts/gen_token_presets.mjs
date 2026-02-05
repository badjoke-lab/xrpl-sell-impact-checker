#!/usr/bin/env node
/**
 * Generate XRPL token presets (>= 10k) for offline suggestions.
 *
 * Tries sources in order:
 * 1) XRPLScan: https://api.xrpscan.com/api/v1/tokens?limit=200&offset=0
 * 2) XRPL Meta: https://s1.xrplmeta.org/tokens?limit=200&offset=0
 *
 * Output: JSON array [{currency, issuer, label, name, trustlines}]
 *
 * Usage:
 *   node scripts/gen_token_presets.mjs --out data/token-presets.json --max 20000
 *   node scripts/gen_token_presets.mjs --out data/token-presets.json --max 20000 --source xrplmeta
 */
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

function arg(name, def=null){
  const i = process.argv.indexOf(name);
  if (i >= 0 && i+1 < process.argv.length) return process.argv[i+1];
  return def;
}
function has(name){ return process.argv.includes(name); }

const outPath = arg("--out", "data/token-presets.json");
const maxN = Number(arg("--max", "20000"));
const source = arg("--source", "auto"); // auto | xrpscan | xrplmeta
const concurrency = Math.max(1, Number(arg("--concurrency", "4")));
const pageSize = Math.min(200, Math.max(50, Number(arg("--page", "200"))));

const SOURCES = {
  xrpscan: {
    base: "https://api.xrpscan.com/api/v1",
    list: (limit, offset) => `https://api.xrpscan.com/api/v1/tokens?limit=${limit}&offset=${offset}`,
    parse: (j) => ({
      count: Number(j?.count ?? j?.total ?? j?.total_tokens ?? 0) || null,
      tokens: Array.isArray(j?.tokens) ? j.tokens : (Array.isArray(j) ? j : []),
    }),
  },
  xrplmeta: {
    base: "https://s1.xrplmeta.org",
    list: (limit, offset) => `https://s1.xrplmeta.org/tokens?limit=${limit}&offset=${offset}`,
    parse: (j) => ({
      count: Number(j?.count ?? j?.total ?? j?.total_tokens ?? 0) || null,
      tokens: Array.isArray(j?.tokens) ? j.tokens : (Array.isArray(j) ? j : []),
    }),
  },
};

function pickSources(){
  if (source === "xrpscan") return ["xrpscan"];
  if (source === "xrplmeta") return ["xrplmeta"];
  return ["xrpscan","xrplmeta"];
}

function normStr(x){ return String(x ?? "").trim(); }
function firstNonEmpty(...xs){
  for (const x of xs){
    const s = normStr(x);
    if (s) return s;
  }
  return "";
}

function normalizeToken(it){
  const currency = firstNonEmpty(it?.currency, it?.token?.currency);
  const issuer = firstNonEmpty(it?.issuer, it?.token?.issuer);
  if (!currency || !issuer) return null;

  const meta = it?.meta?.token ?? it?.meta ?? it?.token ?? null;
  const symbol = firstNonEmpty(meta?.symbol, it?.symbol, it?.ticker);
  const name = firstNonEmpty(meta?.name, it?.name, it?.full_name);
  const label = firstNonEmpty(it?.label, symbol, currency);

  const trustlinesRaw =
    it?.trustlines ?? it?.trust_lines ?? it?.trustlines_count ?? it?.trustline_count;
  const trustlines =
    typeof trustlinesRaw === "number" && Number.isFinite(trustlinesRaw)
      ? trustlinesRaw
      : (typeof trustlinesRaw === "string" && trustlinesRaw.match(/^\d+$/) ? Number(trustlinesRaw) : null);

  return { currency, issuer, label, name, trustlines };
}

async function fetchJson(url, timeoutMs=15000){
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try{
    const r = await fetch(url, { signal: ac.signal, headers: { "accept": "application/json" }});
    const text = await r.text();
    let j;
    try{ j = JSON.parse(text); } catch { j = null; }
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}: ${text.slice(0,120)}`);
    if (!j) throw new Error(`Non-JSON response: ${text.slice(0,120)}`);
    return j;
  } finally {
    clearTimeout(t);
  }
}

async function probe(srcKey){
  try{
    const j = await fetchJson(SOURCES[srcKey].list(1,0), 8000);
    const parsed = SOURCES[srcKey].parse(j);
    const cnt = parsed.count ?? (Array.isArray(parsed.tokens) ? parsed.tokens.length : 0);
    if (!cnt) throw new Error("count missing");
    return { ok:true, count:cnt };
  } catch (e){
    return { ok:false, err: String(e?.message ?? e) };
  }
}

async function main(){
  const candidates = pickSources();
  let chosen = null;
  for (const k of candidates){
    const pr = await probe(k);
    if (pr.ok){
      chosen = k;
      console.log(`[gen] source=${k} count~${pr.count}`);
      break;
    }
    console.warn(`[gen] source=${k} unavailable: ${pr.err}`);
  }
  if (!chosen) {
    console.error("[gen] No sources reachable. Try VPN / different network, or pass --source to force.");
    process.exit(2);
  }

  const listUrl = SOURCES[chosen].list;
  const parse = SOURCES[chosen].parse;

  // If API doesn't provide count reliably, we'll just iterate offsets until empty or max reached.
  let count = null;
  try{
    const j0 = await fetchJson(listUrl(1,0), 12000);
    const p0 = parse(j0);
    count = p0.count;
  } catch {}

  const target = Math.min(maxN, count ?? maxN);
  const pages = Math.ceil(target / pageSize);

  console.log(`[gen] target=${target} pageSize=${pageSize} pages=${pages} concurrency=${concurrency}`);

  const out = [];
  const seen = new Set();

  let nextPage = 0;
  async function worker(){
    while (true){
      const page = nextPage++;
      if (page >= pages) return;
      const offset = page * pageSize;

      // retry with backoff
      let j = null;
      for (let attempt=0; attempt<4; attempt++){
        try{
          j = await fetchJson(listUrl(pageSize, offset), 20000);
          break;
        } catch (e){
          const wait = 400 * Math.pow(2, attempt);
          console.warn(`[gen] page=${page} offset=${offset} retry=${attempt+1} err=${String(e?.message ?? e)} wait=${wait}ms`);
          await sleep(wait);
        }
      }
      if (!j) continue;

      const parsed = parse(j);
      const toks = parsed.tokens || [];
      if (!toks.length) {
        // stop early if API returns empty pages
        nextPage = pages;
        return;
      }

      for (const it of toks){
        const t = normalizeToken(it);
        if (!t) continue;
        const k = (t.currency + ":" + t.issuer).toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(t);
        if (out.length >= maxN) {
          nextPage = pages;
          return;
        }
      }

      if (page % 10 === 0) console.log(`[gen] progress=${out.length}`);
    }
  }

  await Promise.all(Array.from({length: concurrency}, () => worker()));

  // sort: trustlines desc, then label
  out.sort((a,b) => (b.trustlines ?? -1) - (a.trustlines ?? -1) || String(a.label).localeCompare(String(b.label)));

  // ensure dir
  fs.mkdirSync(path.dirname(outPath), { recursive:true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf-8");
  console.log(`[gen] wrote ${out.length} -> ${outPath}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
