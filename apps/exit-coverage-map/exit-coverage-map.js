const FIXED_LEDGER = {
  hash: "E549C50B6C88925669DC7C67FC768E49B118E4EB4F1708CD995E7EFE4596A4C5",
  index: 103197813,
  endpoint: "https://xrplcluster.com/"
}

const ISSUERS = {
  baseline: "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq",
  bookOnly: "rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz",
  ammOnly: "rJmRk232iZvsS4kjxgqbrWi8QeedrpZJkb",
  invalid: "invalid"
}

function sellImpactUrl(currency, issuer) {
  return `/apps/sell-impact/?currency=${encodeURIComponent(currency)}&issuer=${encodeURIComponent(issuer)}`
}

const DATASETS = {
  baseline: {
    key: "baseline",
    label: "Baseline contract",
    issuer: ISSUERS.baseline,
    issuerCheck: { ok: true, label: "passed", note: "valid issuer / contract baseline" },
    rows: [
      {
        currency: "EUR",
        issuer: ISSUERS.baseline,
        state: "dual",
        bookPresent: true,
        ammPresent: true,
        evidence: [
          "Baseline contract row: EUR = dual.",
          "Both book and AMM coverage are treated as present.",
          "Sell Impact deep link is required on every row."
        ]
      },
      {
        currency: "USD",
        issuer: ISSUERS.baseline,
        state: "dual",
        bookPresent: true,
        ammPresent: true,
        evidence: [
          "Baseline contract row: USD = dual.",
          "Route exists through both book and AMM.",
          "Use Sell Impact for actual execution depth."
        ]
      },
      {
        currency: "BTC",
        issuer: ISSUERS.baseline,
        state: "none",
        bookPresent: false,
        ammPresent: false,
        evidence: [
          "Baseline contract row: BTC = none.",
          "Candidate exists but no XRP exit route is observed.",
          "Row still keeps Sell Impact handoff."
        ]
      },
      {
        currency: "ARMY",
        issuer: ISSUERS.baseline,
        state: "none",
        bookPresent: false,
        ammPresent: false,
        evidence: [
          "Baseline contract row: ARMY = none.",
          "Candidate exists but no XRP exit route is observed.",
          "Coverage is route absence, not token nonexistence."
        ]
      }
    ]
  },

  expanded: {
    key: "expanded",
    label: "Expanded mixed proof",
    issuer: "proof-mixed-issuer",
    issuerCheck: { ok: true, label: "passed", note: "local proof scaffold / 4 states" },
    rows: [
      {
        currency: "EUR",
        issuer: ISSUERS.baseline,
        state: "dual",
        bookPresent: true,
        ammPresent: true,
        evidence: [
          "Baseline dual proof row.",
          "Book and AMM are both present.",
          "Use Sell Impact to inspect impact and receive."
        ]
      },
      {
        currency: "USD",
        issuer: ISSUERS.baseline,
        state: "dual",
        bookPresent: true,
        ammPresent: true,
        evidence: [
          "Baseline dual proof row.",
          "Both route families exist.",
          "This page stops at route coverage."
        ]
      },
      {
        currency: "534F4C4F00000000000000000000000000000000",
        issuer: ISSUERS.bookOnly,
        state: "book-only",
        bookPresent: true,
        ammPresent: false,
        evidence: [
          "Live proof row: SOLO issuer was detected as book-only.",
          "book_offer_count_seen: 1 in fixed proof ledger.",
          "No AMM pair was included in the proof set."
        ]
      },
      {
        currency: "2436395852500000000000000000000000000000",
        issuer: ISSUERS.ammOnly,
        state: "amm-only",
        bookPresent: false,
        ammPresent: true,
        evidence: [
          "Live proof row from AMM-only sample.",
          "AMM present, but book_present = false.",
          "This is the key proof that amm-only is real."
        ]
      },
      {
        currency: "BTC",
        issuer: ISSUERS.baseline,
        state: "none",
        bookPresent: false,
        ammPresent: false,
        evidence: [
          "Baseline none proof row.",
          "No XRP exit route observed.",
          "Coverage absence only; price impact not evaluated here."
        ]
      },
      {
        currency: "ARMY",
        issuer: ISSUERS.baseline,
        state: "none",
        bookPresent: false,
        ammPresent: false,
        evidence: [
          "Baseline none proof row.",
          "No book and no AMM observed.",
          "Deep link still remains available."
        ]
      }
    ]
  },

  bookOnly: {
    key: "bookOnly",
    label: "Book-only proof",
    issuer: ISSUERS.bookOnly,
    issuerCheck: { ok: true, label: "passed", note: "live proof / SOLO" },
    rows: [
      {
        currency: "534F4C4F00000000000000000000000000000000",
        issuer: ISSUERS.bookOnly,
        state: "book-only",
        bookPresent: true,
        ammPresent: false,
        evidence: [
          "Proof hit: SOLO row was found as book-only.",
          "sample_offer_account: rstB8dWrF2atLUsFKsyyaCg5FFw7cn71Gf",
          "sample_offer_sequence: 91486581",
          "book_offer_count_seen: 1"
        ]
      }
    ]
  },

  ammOnly: {
    key: "ammOnly",
    label: "AMM-only proof",
    issuer: ISSUERS.ammOnly,
    issuerCheck: { ok: true, label: "passed", note: "live proof / AMM-only sample" },
    rows: [
      {
        currency: "2436395852500000000000000000000000000000",
        issuer: ISSUERS.ammOnly,
        state: "amm-only",
        bookPresent: false,
        ammPresent: true,
        evidence: [
          "Proof hit from AMM-only sample.",
          "AMM account: rG56tVt3NnQmvoRGCFTSwTwkv5oxyqqS1S",
          "Book was absent in proof ledger.",
          "Fixed ledger summary included many AMM-only rows."
        ]
      }
    ]
  },

  invalid: {
    key: "invalid",
    label: "Invalid issuer",
    issuer: ISSUERS.invalid,
    issuerCheck: { ok: false, label: "failed", note: "404 / actMalformed" },
    rows: [],
    invalid: true,
    invalidReason: "Invalid issuer · 404 / actMalformed"
  },

  empty: {
    key: "empty",
    label: "Empty issuer",
    issuer: "rEmptyProofIssuer0000000000000000000",
    issuerCheck: { ok: true, label: "passed", note: "no candidates found" },
    rows: []
  }
}

for (const dataset of Object.values(DATASETS)) {
  dataset.rows = dataset.rows.map((row) => ({
    ...row,
    key: `${row.currency}|${row.issuer}`,
    sellImpactUrl: sellImpactUrl(row.currency, row.issuer)
  }))
}

const el = {
  errorBanner: document.querySelector("#page-error-banner"),
  issuerInput: document.querySelector("#issuer-input"),
  presetSelect: document.querySelector("#preset-select"),
  resetButton: document.querySelector("#reset-button"),
  runButton: document.querySelector("#run-button"),
  runStatus: document.querySelector("#run-status"),
  proofChip: document.querySelector("#proof-chip"),
  ledgerChip: document.querySelector("#ledger-chip"),
  sourceChip: document.querySelector("#source-chip"),
  issuerChip: document.querySelector("#issuer-chip"),
  tableHeadNote: document.querySelector("#table-head-note"),
  coverageRows: document.querySelector("#coverage-rows"),
  coverageEmpty: document.querySelector("#coverage-empty"),
  summaryTotal: document.querySelector("#summary-total"),
  summaryDual: document.querySelector("#summary-dual"),
  summaryBookOnly: document.querySelector("#summary-book-only"),
  summaryAmmOnly: document.querySelector("#summary-amm-only"),
  summaryNone: document.querySelector("#summary-none"),
  summaryIssuerCheck: document.querySelector("#summary-issuer-check"),
  summaryIssuerNote: document.querySelector("#summary-issuer-note"),
  detailStateBadge: document.querySelector("#detail-state-badge"),
  detailTitle: document.querySelector("#detail-title"),
  detailSubtitle: document.querySelector("#detail-subtitle"),
  detailCurrency: document.querySelector("#detail-currency"),
  detailIssuer: document.querySelector("#detail-issuer"),
  detailBook: document.querySelector("#detail-book"),
  detailAmm: document.querySelector("#detail-amm"),
  detailKey: document.querySelector("#detail-key"),
  detailExplanation: document.querySelector("#detail-explanation"),
  detailEvidenceList: document.querySelector("#detail-evidence-list"),
  sellImpactLink: document.querySelector("#sell-impact-link"),
  debugPreset: document.querySelector("#debug-preset"),
  debugIssuer: document.querySelector("#debug-issuer"),
  debugJson: document.querySelector("#debug-json")
}

let currentDataset = DATASETS.expanded
let selectedKey = null

function stateLabel(state) {
  switch (state) {
    case "dual": return "Book + AMM"
    case "book-only": return "Book only"
    case "amm-only": return "AMM only"
    default: return "No XRP exit observed"
  }
}

function stateClass(state) {
  switch (state) {
    case "dual": return "state-dual"
    case "book-only": return "state-book-only"
    case "amm-only": return "state-amm-only"
    default: return "state-none"
  }
}

function compactMiddle(value, lead = 10, tail = 6) {
  if (!value) return "—"
  if (value.length <= lead + tail + 1) return value
  return `${value.slice(0, lead)}…${value.slice(-tail)}`
}

function displayCurrencyCompact(value) {
  if (!value) return "—"
  if (/^[A-Z]{3,6}$/.test(value)) return value
  return compactMiddle(value, 10, 8)
}

function displayIssuerCompact(value) {
  return compactMiddle(value, 10, 6)
}

function resolvePresetFromIssuer(value) {
  const issuer = value.trim()
  if (!issuer) return "empty"
  if (issuer === ISSUERS.baseline) return "baseline"
  if (issuer === ISSUERS.bookOnly) return "bookOnly"
  if (issuer === ISSUERS.ammOnly) return "ammOnly"
  if (issuer === ISSUERS.invalid || issuer.toLowerCase() === "invalid") return "invalid"
  return el.presetSelect.value || "expanded"
}

function sortRows(rows) {
  const order = { "dual": 0, "book-only": 1, "amm-only": 2, "none": 3 }
  return [...rows].sort((a, b) => {
    const byState = order[a.state] - order[b.state]
    if (byState !== 0) return byState
    return a.currency.localeCompare(b.currency)
  })
}

function renderSummary(dataset) {
  const rows = dataset.rows || []
  const counts = {
    dual: rows.filter((row) => row.state === "dual").length,
    "book-only": rows.filter((row) => row.state === "book-only").length,
    "amm-only": rows.filter((row) => row.state === "amm-only").length,
    none: rows.filter((row) => row.state === "none").length
  }

  el.summaryTotal.textContent = String(rows.length)
  el.summaryDual.textContent = String(counts.dual)
  el.summaryBookOnly.textContent = String(counts["book-only"])
  el.summaryAmmOnly.textContent = String(counts["amm-only"])
  el.summaryNone.textContent = String(counts.none)
  el.summaryIssuerCheck.textContent = dataset.issuerCheck.ok ? "passed" : "failed"
  el.summaryIssuerNote.textContent = dataset.issuerCheck.note
}

function renderTable(dataset) {
  el.coverageRows.innerHTML = ""
  const rows = sortRows(dataset.rows || [])

  if (!rows.length) {
    el.coverageEmpty.hidden = false
    el.tableHeadNote.textContent = dataset.invalid ? "Invalid issuer response." : "No candidate rows."
    return
  }

  el.coverageEmpty.hidden = true
  el.tableHeadNote.textContent = `${rows.length} rows`

  for (const row of rows) {
    const tr = document.createElement("tr")
    if (row.key === selectedKey) tr.classList.add("is-selected")
    tr.innerHTML = `
      <td><span class="coverage-state-badge ${stateClass(row.state)}">${stateLabel(row.state)}</span></td>
      <td class="mono" title="${row.currency}">${displayCurrencyCompact(row.currency)}</td>
      <td class="mono" title="${row.issuer}">${displayIssuerCompact(row.issuer)}</td>
      <td>${row.bookPresent ? "Yes" : "No"}</td>
      <td>${row.ammPresent ? "Yes" : "No"}</td>
      <td><a class="row-open-link" href="${row.sellImpactUrl}" target="_blank" rel="noopener">open</a></td>
    `
    tr.addEventListener("click", () => {
      selectedKey = row.key
      renderTable(currentDataset)
      renderDetail(currentDataset)
    })
    const rowLink = tr.querySelector(".row-open-link")
    if (rowLink) {
      rowLink.addEventListener("click", (event) => {
        event.stopPropagation()
      })
    }
    el.coverageRows.appendChild(tr)
  }
}

function renderDetail(dataset) {
  const rows = dataset.rows || []
  const row = rows.find((item) => item.key === selectedKey) || rows[0]

  if (dataset.invalid) {
    el.detailStateBadge.className = "coverage-state-badge state-none"
    el.detailStateBadge.textContent = "Invalid issuer"
    el.detailTitle.textContent = "Issuer check failed"
    el.detailSubtitle.textContent = dataset.invalidReason
    el.detailCurrency.textContent = "—"
    el.detailIssuer.textContent = dataset.issuer
    el.detailBook.textContent = "—"
    el.detailAmm.textContent = "—"
    el.detailKey.textContent = "—"
    el.detailExplanation.textContent = "The issuer input is malformed in this proof case."
    el.detailEvidenceList.innerHTML = "<li>Expected failure: 404 / actMalformed.</li>"
    el.sellImpactLink.href = "/apps/sell-impact/"
    return
  }

  if (!row) {
    el.detailStateBadge.className = "coverage-state-badge state-none"
    el.detailStateBadge.textContent = "No selection"
    el.detailTitle.textContent = "Coverage detail"
    el.detailSubtitle.textContent = "No candidate rows are available for this dataset."
    el.detailCurrency.textContent = "—"
    el.detailIssuer.textContent = dataset.issuer || "—"
    el.detailBook.textContent = "—"
    el.detailAmm.textContent = "—"
    el.detailKey.textContent = "—"
    el.detailExplanation.textContent = "Nothing to inspect yet."
    el.detailEvidenceList.innerHTML = "<li>No candidate rows were produced.</li>"
    el.sellImpactLink.href = "/apps/sell-impact/"
    return
  }

  selectedKey = row.key
  el.detailStateBadge.className = `coverage-state-badge ${stateClass(row.state)}`
  el.detailStateBadge.textContent = stateLabel(row.state)
  el.detailTitle.textContent = displayCurrencyCompact(row.currency)
  el.detailSubtitle.textContent = row.state === "dual"
    ? "Both XRP exit route families are available."
    : row.state === "book-only"
      ? "Orderbook exit exists, but AMM was not observed."
      : row.state === "amm-only"
        ? "AMM exit exists, but live book was not observed."
        : "No XRP exit route was observed for this row."

  el.detailCurrency.textContent = row.currency
  el.detailIssuer.textContent = row.issuer
  el.detailBook.textContent = row.bookPresent ? "Yes" : "No"
  el.detailAmm.textContent = row.ammPresent ? "Yes" : "No"
  el.detailKey.textContent = row.key
  el.detailExplanation.textContent = "Coverage only. Continue in Sell Impact for execution quality."
  el.detailEvidenceList.innerHTML = row.evidence.map((item) => `<li>${item}</li>`).join("")
  el.sellImpactLink.href = row.sellImpactUrl
}

function renderDebug(dataset) {
  el.debugPreset.textContent = dataset.key
  el.debugIssuer.textContent = dataset.issuer
  el.debugJson.textContent = JSON.stringify({
    dataset: dataset.key,
    issuer: dataset.issuer,
    issuerCheck: dataset.issuerCheck,
    selectedKey,
    rows: dataset.rows
  }, null, 2)
}

function render(dataset) {
  currentDataset = dataset
  if (!selectedKey || !dataset.rows.some((row) => row.key === selectedKey)) {
    selectedKey = dataset.rows[0]?.key ?? null
  }

  el.errorBanner.hidden = true
  el.issuerInput.value = dataset.issuer
  el.issuerChip.textContent = `issuer: ${dataset.issuer}`
  el.proofChip.textContent = `proof: ${dataset.label}`
  el.ledgerChip.textContent = `ledger: ${FIXED_LEDGER.index}`
  el.sourceChip.textContent = dataset.invalid ? "source: invalid issuer baseline" : "source: fixed proof baseline"
  el.runStatus.textContent = dataset.invalid ? "INVALID ISSUER" : "READY"
  renderSummary(dataset)
  renderTable(dataset)
  renderDetail(dataset)
  renderDebug(dataset)
}

el.runButton.addEventListener("click", () => {
  const key = resolvePresetFromIssuer(el.issuerInput.value)
  el.presetSelect.value = key
  render(DATASETS[key])
})

el.presetSelect.addEventListener("change", () => {
  render(DATASETS[el.presetSelect.value])
})

el.resetButton.addEventListener("click", () => {
  el.presetSelect.value = "expanded"
  render(DATASETS.expanded)
})

render(DATASETS.expanded)
