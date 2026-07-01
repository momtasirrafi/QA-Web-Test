#!/usr/bin/env node
import { writeFile } from "node:fs/promises";

const startUrl = process.argv[2];
const maxPagesArg = (process.argv[3] || "12").toString().toLowerCase();
const maxPages = maxPagesArg === "all" || maxPagesArg === "0" ? Infinity : Number(maxPagesArg);
const timeoutMs = Number(process.env.QA_TIMEOUT_MS || 12000);
const crawlDelayMs = Number(process.env.QA_CRAWL_DELAY_MS || 150);

if (!startUrl) {
  console.log("Usage: node live-qa-agent.mjs https://your-site.com [maxPages]");
  process.exit(1);
}

const root = new URL(startUrl);
const queue = [root.href];
const seen = new Set();
const pages = [];
const assets = [];
const issues = [];

function normalizeUrl(value, base) {
  try {
    const url = new URL(value, base);
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function sameOrigin(url) {
  try {
    return new URL(url).origin === root.origin;
  } catch {
    return false;
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractAttr(html, attr) {
  const regex = new RegExp(`${attr}=["']([^"'#]+)["']`, "gi");
  return [...html.matchAll(regex)].map((match) => match[1]);
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, " ").trim() : "";
}

function hasViewport(html) {
  return /<meta[^>]+name=["']viewport["'][^>]*>/i.test(html);
}

function countFormsWithoutSubmit(html) {
  const forms = [...html.matchAll(/<form[\s\S]*?<\/form>/gi)].map((match) => match[0]);
  return forms.filter((form) => !/<button[^>]*type=["']?submit|<input[^>]*type=["']?submit/i.test(form)).length;
}

async function fetchWithTimer(url, method = "GET") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(url, { method, redirect: "follow", signal: controller.signal });
    const elapsedMs = Math.round(performance.now() - started);
    const contentType = response.headers.get("content-type") || "";
    const text = method === "GET" && contentType.includes("text/html") ? await response.text() : "";
    return { ok: true, url: response.url, status: response.status, elapsedMs, contentType, headers: response.headers, text };
  } catch (error) {
    return { ok: false, url, status: 0, elapsedMs: Math.round(performance.now() - started), error: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

function addIssue(level, url, message) {
  issues.push({ level, url, message });
}

function inspectHeaders(url, headers) {
  const required = [
    ["content-security-policy", "Missing Content-Security-Policy header"],
    ["x-content-type-options", "Missing X-Content-Type-Options header"],
    ["referrer-policy", "Missing Referrer-Policy header"]
  ];
  if (url.startsWith("https://")) required.push(["strict-transport-security", "Missing Strict-Transport-Security header"]);
  required.forEach(([name, message]) => {
    if (!headers.get(name)) addIssue("warning", url, message);
  });
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function discoverSitemapUrls() {
  const candidates = [`${root.origin}/sitemap.xml`, `${root.origin}/sitemap_index.xml`];
  const found = [];
  for (const sitemapUrl of candidates) {
    const result = await fetchWithTimer(sitemapUrl);
    if (!result.ok || result.status >= 400) continue;
    const body = await (async () => {
      try {
        const response = await fetch(sitemapUrl, { signal: AbortSignal.timeout(timeoutMs) });
        return await response.text();
      } catch {
        return "";
      }
    })();
    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => match[1].trim());
    found.push(...locs);
  }
  return unique(found).filter(sameOrigin);
}

async function crawl() {
  const sitemapUrls = await discoverSitemapUrls();
  if (sitemapUrls.length) {
    console.log(`Found ${sitemapUrls.length} URL(s) in sitemap.xml`);
    sitemapUrls.forEach((url) => { if (!queue.includes(url)) queue.push(url); });
  }
  while (queue.length && seen.size < maxPages) {
    const target = queue.shift();
    if (!target || seen.has(target) || !sameOrigin(target)) continue;
    seen.add(target);
    if (crawlDelayMs) await sleep(crawlDelayMs);

    const result = await fetchWithTimer(target);
    const page = {
      url: target,
      finalUrl: result.url,
      status: result.status,
      responseMs: result.elapsedMs,
      title: "",
      linkCount: 0,
      assetCount: 0,
      formCount: 0
    };

    if (!result.ok) {
      addIssue("critical", target, `Request failed: ${result.error}`);
      pages.push(page);
      continue;
    }

    if (result.status >= 400) addIssue("critical", target, `Page returned HTTP ${result.status}`);
    if (result.elapsedMs > 3000) addIssue("warning", target, `Slow response: ${result.elapsedMs} ms`);
    if (!result.contentType.includes("text/html")) {
      pages.push(page);
      continue;
    }

    inspectHeaders(target, result.headers);
    const html = result.text;
    page.title = extractTitle(html);
    page.formCount = (html.match(/<form\b/gi) || []).length;
    if (!page.title) addIssue("warning", target, "Missing page title");
    if (!hasViewport(html)) addIssue("warning", target, "Missing responsive viewport meta tag");
    const brokenForms = countFormsWithoutSubmit(html);
    if (brokenForms) addIssue("warning", target, `${brokenForms} form(s) do not appear to have a submit button`);

    const links = unique(extractAttr(html, "href").map((href) => normalizeUrl(href, target)));
    const srcs = unique(extractAttr(html, "src").map((src) => normalizeUrl(src, target)));
    page.linkCount = links.length;
    page.assetCount = srcs.length;
    links.filter(sameOrigin).forEach((link) => {
      const path = new URL(link).pathname;
      if (!seen.has(link) && !/\.(png|jpg|jpeg|gif|webp|svg|css|js|pdf|zip|ico)$/i.test(path)) queue.push(link);
    });
    srcs.filter(sameOrigin).slice(0, 20).forEach((asset) => assets.push({ page: target, url: asset }));
    pages.push(page);
  }
}

async function checkAssets() {
  const targets = unique(assets.map((asset) => asset.url)).slice(0, 80);
  for (const assetUrl of targets) {
    const result = await fetchWithTimer(assetUrl, "GET");
    if (!result.ok) addIssue("critical", assetUrl, `Asset request failed: ${result.error}`);
    else if (result.status >= 400) addIssue("critical", assetUrl, `Asset returned HTTP ${result.status}`);
    else if (result.elapsedMs > 3000) addIssue("warning", assetUrl, `Slow asset response: ${result.elapsedMs} ms`);
  }
}

function scoreReport() {
  const critical = issues.filter((issue) => issue.level === "critical").length;
  const warnings = issues.filter((issue) => issue.level === "warning").length;
  return Math.max(0, 100 - critical * 22 - warnings * 6);
}

function htmlReport(report) {
  const issueRows = report.issues.map((issue) => `<tr><td>${issue.level}</td><td>${escapeReport(issue.url)}</td><td>${escapeReport(issue.message)}</td></tr>`).join("") || `<tr><td colspan="3">No issues found</td></tr>`;
  const pageRows = report.pages.map((page) => `<tr><td>${escapeReport(page.url)}</td><td>${page.status}</td><td>${page.responseMs} ms</td><td>${escapeReport(page.title || "Untitled")}</td><td>${page.linkCount}</td><td>${page.assetCount}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Live QA Report</title><style>body{font-family:Segoe UI,Arial,sans-serif;margin:28px;background:#f4f6f8;color:#17202a}main{max-width:1180px;margin:auto}section{background:white;border:1px solid #d9dee7;border-radius:8px;padding:18px;margin:16px 0}h1,h2{margin:0 0 12px}.score{font-size:44px;font-weight:800}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #edf0f5;text-align:left;vertical-align:top}th{font-size:12px;text-transform:uppercase;color:#667085}.critical{color:#b91c1c}.warning{color:#92400e}</style></head><body><main><h1>Live QA Report</h1><section><div class="score">${report.score}%</div><p>${escapeReport(report.startUrl)} checked on ${escapeReport(report.checkedAt)}</p><p>${report.pages.length} pages checked, ${report.issues.length} issues found.</p></section><section><h2>Issues</h2><table><thead><tr><th>Level</th><th>URL</th><th>Message</th></tr></thead><tbody>${issueRows}</tbody></table></section><section><h2>Pages</h2><table><thead><tr><th>URL</th><th>Status</th><th>Time</th><th>Title</th><th>Links</th><th>Assets</th></tr></thead><tbody>${pageRows}</tbody></table></section></main></body></html>`;
}

function escapeReport(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

if (!Number.isFinite(maxPages)) {
  console.log("Crawling the entire site (no page limit) - this may take a while on large sites.");
}

await crawl();
await checkAssets();
const report = {
  startUrl: root.href,
  checkedAt: new Date().toISOString(),
  score: scoreReport(),
  pages,
  issues,
  summary: {
    pagesChecked: pages.length,
    criticalIssues: issues.filter((issue) => issue.level === "critical").length,
    warnings: issues.filter((issue) => issue.level === "warning").length,
    averageResponseMs: pages.length ? Math.round(pages.reduce((sum, page) => sum + page.responseMs, 0) / pages.length) : 0
  }
};

await writeFile("qa-live-report.json", JSON.stringify(report, null, 2));
await writeFile("qa-live-report.html", htmlReport(report));
console.log(`Live QA score: ${report.score}%`);
console.log(`Pages checked: ${report.summary.pagesChecked}`);
console.log(`Critical issues: ${report.summary.criticalIssues}`);
console.log(`Warnings: ${report.summary.warnings}`);
console.log("Reports: qa-live-report.json and qa-live-report.html");
if (report.issues.length) {
  console.log("Top issues:");
  report.issues.slice(0, 6).forEach((issue) => console.log(`- [${issue.level}] ${issue.message} (${issue.url})`));
}
