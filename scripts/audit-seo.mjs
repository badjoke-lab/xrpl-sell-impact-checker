import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const siteUrl = 'https://xsic.badjoke-lab.com';

const pages = [
  'index.html',
  'apps/index.html',
  'apps/sell-impact/index.html',
  'apps/liquidity-pulse/index.html',
  'apps/flow-alert/index.html',
  'apps/exit-coverage-map/index.html',
  'apps/exposure-graph/index.html',
  'methods/index.html',
  'faq/index.html',
  'disclaimer/index.html',
  'credits/index.html',
  'donate/index.html',
];

const requiredPatterns = [
  ['title', /<title>[^<]+<\/title>/i],
  ['meta description', /<meta\s+name=["']description["']\s+content=["'][^"']+["']/i],
  ['canonical', /<link\s+rel=["']canonical["']\s+href=["'][^"']+["']/i],
  ['og:title', /<meta\s+property=["']og:title["']\s+content=["'][^"']+["']/i],
  ['og:description', /<meta\s+property=["']og:description["']\s+content=["'][^"']+["']/i],
  ['og:url', /<meta\s+property=["']og:url["']\s+content=["'][^"']+["']/i],
  ['og:image', /<meta\s+property=["']og:image["']\s+content=["'][^"']+["']/i],
  ['twitter:card', /<meta\s+name=["']twitter:card["']\s+content=["'][^"']+["']/i],
  ['twitter:title', /<meta\s+name=["']twitter:title["']\s+content=["'][^"']+["']/i],
  ['twitter:description', /<meta\s+name=["']twitter:description["']\s+content=["'][^"']+["']/i],
  ['twitter:image', /<meta\s+name=["']twitter:image["']\s+content=["'][^"']+["']/i],
  ['JSON-LD', /<script\s+type=["']application\/ld\+json["']>/i],
];

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function pageUrlFromPath(path) {
  if (path === 'index.html') return `${siteUrl}/`;
  return `${siteUrl}/${path.replace(/index\.html$/, '')}`;
}

function extractCanonical(html) {
  return html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1] ?? null;
}

function countPageH1(html) {
  const withoutLd = html.replace(/<script\s+type=["']application\/ld\+json["'][\s\S]*?<\/script>/gi, '');
  return (withoutLd.match(/<h1\b/gi) ?? []).length;
}

function pathFromSitemapUrl(url) {
  if (!url.startsWith(`${siteUrl}/`)) return null;
  const pathname = new URL(url).pathname;
  if (pathname === '/') return 'index.html';
  return `${pathname.replace(/^\//, '').replace(/\/$/, '')}/index.html`;
}

const errors = [];
const warnings = [];

const sitemapPath = 'sitemap.xml';
if (!existsSync(join(root, sitemapPath))) {
  errors.push('sitemap.xml is missing');
} else {
  const sitemap = read(sitemapPath);
  const sitemapUrls = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));

  for (const page of pages) {
    const abs = join(root, page);
    if (!existsSync(abs)) {
      errors.push(`${page}: file is missing`);
      continue;
    }

    const html = read(page);
    for (const [label, pattern] of requiredPatterns) {
      if (!pattern.test(html)) errors.push(`${page}: missing ${label}`);
    }

    const h1Count = countPageH1(html);
    if (h1Count !== 1) errors.push(`${page}: expected exactly 1 h1, found ${h1Count}`);

    const canonical = extractCanonical(html);
    const expectedUrl = pageUrlFromPath(page);
    if (canonical && canonical !== expectedUrl) {
      warnings.push(`${page}: canonical is ${canonical}, expected ${expectedUrl}`);
    }
    if (canonical && !sitemapUrls.has(canonical)) {
      errors.push(`${page}: canonical is missing from sitemap (${canonical})`);
    }
  }

  for (const url of sitemapUrls) {
    const path = pathFromSitemapUrl(url);
    if (!path) {
      warnings.push(`sitemap: external or unexpected URL ${url}`);
      continue;
    }
    if (!existsSync(join(root, path))) {
      errors.push(`sitemap: ${url} does not map to ${path}`);
    }
  }
}

if (warnings.length) {
  console.warn('SEO audit warnings:');
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length) {
  console.error('SEO audit failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`SEO audit passed for ${pages.length} pages.`);
