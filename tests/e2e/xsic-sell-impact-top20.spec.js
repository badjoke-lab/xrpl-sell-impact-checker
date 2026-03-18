import { test, expect } from '@playwright/test';
import fs from 'node:fs';

test.describe.configure({ mode: 'serial' });

const URL = 'http://127.0.0.1:5173/apps/sell-impact/?top20probe=1';
const OUT = '/tmp/xsic-top20-report.json';
const SHOT_DIR = '/tmp/xsic-top20-shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const TARGETS = [
  { rank: 1,  symbol: 'RLUSD', subtitle: 'Ripple USD',    amount: '10' },
  { rank: 2,  symbol: 'FUZZY', subtitle: 'FUZZY',         amount: '150000' },
  { rank: 3,  symbol: 'XPM',   subtitle: 'XPM',           amount: '800' },
  { rank: 4,  symbol: 'USDC',  occurrence: 1,             amount: '10' },
  { rank: 5,  symbol: 'ARMY',  occurrence: 1,             amount: '1000' },
  { rank: 6,  symbol: 'PHNIX', subtitle: 'PHNIX',         amount: '800000' },
  { rank: 7,  symbol: 'XLM',   subtitle: 'Ripple Fox',    amount: '40' },
  { rank: 8,  symbol: 'DROP',  subtitle: 'DROP',          amount: '2' },
  { rank: 9,  symbol: 'EVR',   subtitle: 'GateHub EVR',   amount: '60' },
  { rank: 10, symbol: 'BEAR',  subtitle: 'BEAR',          amount: '2500' },
  { rank: 11, symbol: 'mXRP',  subtitle: 'mXRP',          amount: '4' },
  { rank: 12, symbol: 'CNY',   subtitle: 'Ripple Fox',    amount: '40' },
  { rank: 13, symbol: 'SOLO',  subtitle: 'Sologenic',     amount: '120' },
  { rank: 14, symbol: 'ATM',   subtitle: 'ALL THE MONEY', amount: '800000' },
  { rank: 15, symbol: 'CULT',  subtitle: 'CULT',          amount: '0.03' },
  { rank: 16, symbol: 'SLT',   subtitle: 'SLT',           amount: '350000' },
  { rank: 17, symbol: 'ARMY',  occurrence: 2,             amount: '8000' },
  { rank: 18, symbol: 'XRG',   subtitle: 'xGreen.Energy', amount: '7000' },
  { rank: 19, symbol: 'FLR',   subtitle: 'GateHub FLR',   amount: '700' },
  { rank: 20, symbol: 'USDC',  subtitle: 'GateHub USDC',  amount: '6' },
];

const results = [];

function norm(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

async function collectVisibleDataResults(page) {
  return await page.evaluate(() => {
    const counts = {};
    const rows = [];
    for (const el of document.querySelectorAll('[data-result]')) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const hidden =
        !!el.closest('[hidden]') ||
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        rect.width === 0 ||
        rect.height === 0;
      if (hidden) continue;
      const name = el.getAttribute('data-result') || 'unknown';
      counts[name] = (counts[name] || 0) + 1;
      rows.push({
        key: `${name}#${counts[name]}`,
        name,
        text: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim(),
      });
    }
    return rows;
  });
}

function classify(rows) {
  const placeholderRx = [
    /waiting/i,
    /appears after estimate/i,
    /^\s*—+\s*$/,
    /^\s*--+\s*$/,
    /^\s*-\s*$/,
    /^\s*…\s*$/,
  ];
  const errorRx = [/failed/i, /\berror\b/i, /rpc_error/i];

  const placeholders = [];
  const errors = [];
  for (const row of rows) {
    if (placeholderRx.some((rx) => rx.test(row.text))) placeholders.push(row);
    if (errorRx.some((rx) => rx.test(row.text))) errors.push(row);
  }
  return { placeholders, errors };
}

async function pickSuggestion(page, currencyInput, issuerInput, target) {
  await currencyInput.click();
  await currencyInput.fill('');
  await page.waitForTimeout(150);
  await currencyInput.fill(target.symbol);

  const slowSymbols = new Set(['RLUSD', 'USDC', 'XPM']);
  await page.waitForTimeout(slowSymbols.has(target.symbol) ? 2500 : 1400);

  const rowsLoc = page.locator('#token-suggestions > *');
  const count = await rowsLoc.count();
  if (!count) {
    throw new Error(`no suggestion rows appeared for ${target.symbol}`);
  }

  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const text = norm(await rowsLoc.nth(i).innerText().catch(() => ''));
    if (text) rows.push({ i, text });
  }

  let matches = rows.filter((r) => r.text.toUpperCase().includes(target.symbol.toUpperCase()));
  if (target.subtitle) {
    matches = matches.filter((r) => r.text.toUpperCase().includes(target.subtitle.toUpperCase()));
  }

  const chosen =
    typeof target.occurrence === 'number'
      ? matches[target.occurrence - 1]
      : matches[0];

  if (!chosen) {
    throw new Error(
      `suggestion not found for ${target.symbol} ${target.subtitle || ''} occurrence=${target.occurrence || 1}\n` +
      rows.map((r) => `  [${r.i}] ${r.text}`).join('\n')
    );
  }

  const chosenRow = rowsLoc.nth(chosen.i);
  const chosenButton = chosenRow.locator('button.token-suggestion-btn').first();

  await chosenButton.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(100);

  try {
    await chosenButton.click({ timeout: 3000 });
  } catch {
    try {
      await chosenButton.click({ force: true, timeout: 3000 });
    } catch {
      const handle = await chosenButton.elementHandle();
      if (!handle) {
        throw new Error(`suggestion button handle missing for ${target.symbol}`);
      }
      await page.evaluate((el) => el.click(), handle);
    }
  }

  await page.waitForTimeout(500);

  const issuer = await issuerInput.inputValue();
  if (!issuer.trim()) {
    throw new Error(`issuer empty after clicking suggestion: ${chosen.text}`);
  }

  return {
    chosenText: chosen.text,
    issuer,
    allRows: rows,
  };
}

for (const target of TARGETS) {
  test(`${String(target.rank).padStart(2, '0')}-${target.symbol}`, async ({ page }) => {
    test.setTimeout(120000);

    const record = {
      rank: target.rank,
      symbol: target.symbol,
      subtitle: target.subtitle || '',
      occurrence: target.occurrence || null,
      amount: target.amount,
      pass: false,
      reason: [],
      apiCalls: [],
      browserErrors: [],
    };

    page.on('response', async (resp) => {
      const url = resp.url();
      if (url.includes('/api/book-offers') || url.includes('/api/amm-info')) {
        record.apiCalls.push({
          url,
          status: resp.status(),
          ok: resp.ok(),
        });
      }
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        record.browserErrors.push(msg.text());
      }
    });

    try {
      await page.goto(URL, { waitUntil: 'domcontentloaded' });

      const currencyInput = page.locator('#currency-input').first();
      const issuerInput = page.locator('#issuer-input').first();
      const amountInput = page.locator('#sell-amount-input').first();
      const estimateButton = page.locator('.primary-button').first();
      const resetButton = page.locator('#reset-inputs').first();
      const explainButton = page.locator('#mode-explain').first();

      await expect(currencyInput).toBeVisible({ timeout: 15000 });
      await expect(issuerInput).toBeVisible({ timeout: 15000 });
      await expect(amountInput).toBeVisible({ timeout: 15000 });
      await expect(estimateButton).toBeVisible({ timeout: 15000 });

      await resetButton.click().catch(() => {});
      await page.waitForTimeout(250);
      await explainButton.click().catch(() => {});
      await page.waitForTimeout(200);

      const picked = await pickSuggestion(page, currencyInput, issuerInput, target);
      record.chosenSuggestion = picked.chosenText;
      record.issuer = picked.issuer;
      record.suggestionRows = picked.allRows;

      await amountInput.fill(String(target.amount));
      await page.waitForTimeout(150);

      const apiBefore = record.apiCalls.length;
      await estimateButton.click({ force: true });

      const started = Date.now();
      while (Date.now() - started < 25000) {
        if (record.apiCalls.length > apiBefore) break;
        await page.waitForTimeout(120);
      }
      if (record.apiCalls.length === apiBefore) {
        throw new Error('estimate did not trigger api responses in time');
      }

      await page.waitForTimeout(6500);

      const afterRows = await collectVisibleDataResults(page);
      const classified = classify(afterRows);

      record.afterDataResults = afterRows;
      record.placeholders = classified.placeholders;
      record.errors = classified.errors;

      const bookOk = record.apiCalls.some((x) => x.url.includes('/api/book-offers') && x.status < 400);
      const ammOk = record.apiCalls.some((x) => x.url.includes('/api/amm-info') && x.status < 400);

      if (!bookOk) record.reason.push('book-offers api did not succeed');
      if (!ammOk) record.reason.push('amm-info api did not succeed');
      if (classified.placeholders.length) record.reason.push('visible placeholder text remained');
      if (classified.errors.length) record.reason.push('visible error text remained');

      record.pass = record.reason.length === 0;
    } catch (err) {
      record.reason.push(String(err && err.message ? err.message : err));
    } finally {
      const shot = `${SHOT_DIR}/${String(target.rank).padStart(2, '0')}-${target.symbol}.png`;
      try {
        await page.screenshot({ path: shot, fullPage: true });
        record.screenshot = shot;
      } catch {}
      results.push(record);
    }
  });
}

test.afterAll(async () => {
  const summary = {
    url: URL,
    total: results.length,
    passed: results.filter((x) => x.pass).length,
    failed: results.filter((x) => !x.pass).length,
    results,
  };
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(`wrote ${OUT}`);
  console.log(`passed=${summary.passed} failed=${summary.failed}`);
});
