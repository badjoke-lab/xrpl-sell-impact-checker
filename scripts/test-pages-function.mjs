#!/usr/bin/env node

const args = process.argv.slice(2);
const baseUrl = args[0] || process.env.PAGES_BASE_URL;

if (!baseUrl) {
  console.error("Usage: node scripts/test-pages-function.mjs <https://your-pages-domain> [currency] [issuer] [limit]");
  process.exit(1);
}

const endpoint = baseUrl.endsWith("/api/book_offers")
  ? baseUrl
  : `${baseUrl.replace(/\/$/, "")}/api/book_offers`;

const currencyArg = args[1];
const issuerArg = args[2];
const limitArg = args[3];

const currency = (currencyArg || "DEM").toUpperCase();
const issuer = issuerArg || "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const limit = Number(limitArg || 50);

const payload = {
  currency,
  issuer,
  limit,
};

const run = async () => {
  const startedAt = new Date().toISOString();
  console.log(`Pages Function test @ ${startedAt}`);
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Request payload: ${JSON.stringify(payload)}`);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const bodyText = await response.text();
    let data = null;
    try {
      data = JSON.parse(bodyText);
    } catch (error) {
      console.error("Error: Failed to parse JSON response.");
      console.error(`Status: ${response.status}`);
      console.error(`Body: ${bodyText.slice(0, 600)}`);
      process.exitCode = 1;
      return;
    }

    const offers = data?.result?.offers;
    const offersCount = Array.isArray(offers) ? offers.length : null;

    console.log(`Status: ${response.status}`);
    console.log(`Offers count: ${offersCount ?? "n/a"}`);
    if (data?.error || data?.result?.error) {
      console.log(`Error: ${data?.error || data?.result?.error}`);
    }
    if (data?.debug) {
      console.log("Debug:");
      console.log(JSON.stringify(data.debug, null, 2));
    }
    console.log("Response JSON:");
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error: Network request failed.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
};

run();
