#!/usr/bin/env node

const XRPL_RPC_URL = "https://s1.ripple.com:51234/";

const args = process.argv.slice(2);
const [currencyArg, issuerArg, limitArg] = args;

const currency = (currencyArg || "DEM").toUpperCase();
const issuer = issuerArg || "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const limit = Number(limitArg || 50);

const takerGets =
  currency === "XRP" ? { currency: "XRP" } : { currency, issuer };

const payload = {
  method: "book_offers",
  params: [
    {
      taker_gets: takerGets,
      taker_pays: { currency: "XRP" },
      limit,
    },
  ],
};

const run = async () => {
  const startedAt = new Date().toISOString();
  console.log(`XRPL RPC direct test @ ${startedAt}`);
  console.log(`Endpoint: ${XRPL_RPC_URL}`);
  console.log(`Request payload: ${JSON.stringify(payload)}`);

  try {
    const response = await fetch(XRPL_RPC_URL, {
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
    console.log("Response JSON:");
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error: Network request failed.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
};

run();
