import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const ARMY_ISSUER = "rGG3wQ4kUzd7Jnmk1n5NWPZjjut62kCBfC";
const GATEHUB_ISSUER = "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq";
const BITSTAMP_ISSUER = "rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv";
const BITSO_ISSUER = "r9Dr5xwkeLegBeXq6h9jPb34w9v1J4m1Xn";
const SOLOGENIC_ISSUER = "rsoLo2S1kiGeCcn6h9FQrgRZzLAbnSRt66";
const CSC_ISSUER = "rCSCManTZ8ME9EoLrSHHYKW8PPwWMgkwr";

const tokens = [
  {
    symbol: "XRP",
    issuer: "",
    name: "XRP",
  },
  {
    symbol: "ARMY",
    issuer: ARMY_ISSUER,
    name: "Army Token",
    tags: ["meme"],
  },
  {
    symbol: "USD",
    issuer: GATEHUB_ISSUER,
    name: "US Dollar",
    tags: ["fiat"],
  },
  {
    symbol: "EUR",
    issuer: GATEHUB_ISSUER,
    name: "Euro",
    tags: ["fiat"],
  },
  {
    symbol: "GBP",
    issuer: GATEHUB_ISSUER,
    name: "British Pound",
    tags: ["fiat"],
  },
  {
    symbol: "CHF",
    issuer: GATEHUB_ISSUER,
    name: "Swiss Franc",
    tags: ["fiat"],
  },
  {
    symbol: "JPY",
    issuer: GATEHUB_ISSUER,
    name: "Japanese Yen",
    tags: ["fiat"],
  },
  {
    symbol: "AUD",
    issuer: GATEHUB_ISSUER,
    name: "Australian Dollar",
    tags: ["fiat"],
  },
  {
    symbol: "CAD",
    issuer: GATEHUB_ISSUER,
    name: "Canadian Dollar",
    tags: ["fiat"],
  },
  {
    symbol: "NZD",
    issuer: GATEHUB_ISSUER,
    name: "New Zealand Dollar",
    tags: ["fiat"],
  },
  {
    symbol: "SGD",
    issuer: GATEHUB_ISSUER,
    name: "Singapore Dollar",
    tags: ["fiat"],
  },
  {
    symbol: "HKD",
    issuer: GATEHUB_ISSUER,
    name: "Hong Kong Dollar",
    tags: ["fiat"],
  },
  {
    symbol: "CNY",
    issuer: GATEHUB_ISSUER,
    name: "Chinese Yuan",
    tags: ["fiat"],
  },
  {
    symbol: "SEK",
    issuer: GATEHUB_ISSUER,
    name: "Swedish Krona",
    tags: ["fiat"],
  },
  {
    symbol: "NOK",
    issuer: GATEHUB_ISSUER,
    name: "Norwegian Krone",
    tags: ["fiat"],
  },
  {
    symbol: "DKK",
    issuer: GATEHUB_ISSUER,
    name: "Danish Krone",
    tags: ["fiat"],
  },
  {
    symbol: "ZAR",
    issuer: GATEHUB_ISSUER,
    name: "South African Rand",
    tags: ["fiat"],
  },
  {
    symbol: "BRL",
    issuer: GATEHUB_ISSUER,
    name: "Brazilian Real",
    tags: ["fiat"],
  },
  {
    symbol: "INR",
    issuer: GATEHUB_ISSUER,
    name: "Indian Rupee",
    tags: ["fiat"],
  },
  {
    symbol: "KRW",
    issuer: GATEHUB_ISSUER,
    name: "South Korean Won",
    tags: ["fiat"],
  },
  {
    symbol: "XAU",
    issuer: GATEHUB_ISSUER,
    name: "Gold",
    tags: ["commodity"],
  },
  {
    symbol: "XAG",
    issuer: GATEHUB_ISSUER,
    name: "Silver",
    tags: ["commodity"],
  },
  {
    symbol: "BTC",
    issuer: GATEHUB_ISSUER,
    name: "Bitcoin",
    tags: ["crypto"],
  },
  {
    symbol: "ETH",
    issuer: GATEHUB_ISSUER,
    name: "Ethereum",
    tags: ["crypto"],
  },
  {
    symbol: "LTC",
    issuer: GATEHUB_ISSUER,
    name: "Litecoin",
    tags: ["crypto"],
  },
  {
    symbol: "BCH",
    issuer: GATEHUB_ISSUER,
    name: "Bitcoin Cash",
    tags: ["crypto"],
  },
  {
    symbol: "ADA",
    issuer: GATEHUB_ISSUER,
    name: "Cardano",
    tags: ["crypto"],
  },
  {
    symbol: "DOT",
    issuer: GATEHUB_ISSUER,
    name: "Polkadot",
    tags: ["crypto"],
  },
  {
    symbol: "SOL",
    issuer: GATEHUB_ISSUER,
    name: "Solana",
    tags: ["crypto"],
  },
  {
    symbol: "DOGE",
    issuer: GATEHUB_ISSUER,
    name: "Dogecoin",
    tags: ["meme"],
  },
  {
    symbol: "USD",
    issuer: BITSTAMP_ISSUER,
    name: "US Dollar (Bitstamp)",
    tags: ["fiat", "exchange"],
  },
  {
    symbol: "EUR",
    issuer: BITSTAMP_ISSUER,
    name: "Euro (Bitstamp)",
    tags: ["fiat", "exchange"],
  },
  {
    symbol: "BTC",
    issuer: BITSTAMP_ISSUER,
    name: "Bitcoin (Bitstamp)",
    tags: ["crypto", "exchange"],
  },
  {
    symbol: "ETH",
    issuer: BITSTAMP_ISSUER,
    name: "Ethereum (Bitstamp)",
    tags: ["crypto", "exchange"],
  },
  {
    symbol: "MXN",
    issuer: BITSO_ISSUER,
    name: "Mexican Peso (Bitso)",
    tags: ["fiat", "exchange"],
  },
  {
    symbol: "USD",
    issuer: BITSO_ISSUER,
    name: "US Dollar (Bitso)",
    tags: ["fiat", "exchange"],
  },
  {
    symbol: "SOLO",
    issuer: SOLOGENIC_ISSUER,
    name: "Sologenic",
    tags: ["dex"],
  },
  {
    symbol: "CSC",
    issuer: CSC_ISSUER,
    name: "CasinoCoin",
    tags: ["gaming"],
  },
];

const armyToken = tokens.find((token) => token.symbol === "ARMY");
if (!armyToken || armyToken.issuer !== ARMY_ISSUER) {
  throw new Error("ARMY issuer is missing or incorrect.");
}

const output = JSON.stringify(tokens, null, 2) + "\n";
const targets = [
  path.join(repoRoot, "data", "tokenlist.seed.json"),
  path.join(repoRoot, "public", "data", "tokenlist.seed.json"),
];

await Promise.all(
  targets.map(async (target) => {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, output, "utf8");
  })
);

console.log(`Wrote ${tokens.length} tokens to ${targets.join(", ")}`);
