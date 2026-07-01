#!/usr/bin/env node
/**
 * Authenticated Live QA Agent
 * Uses a real headless browser (Playwright) so it can log in with your own
 * credentials and then crawl pages that only exist behind a login wall.
 *
 * This only works on sites you're authorized to test, using an account you
 * control. It does not bypass CAPTCHAs, bot-detection, or rate limits.
 *
 * Setup (one time):
 *   npm install playwright
 *   npx playwright install chromium
 *
 * Credentials are read from environment variables, never from a config file
 * that could end up committed to source control.
 *
 * Usage:
 *   set QA_USERNAME=you@example.com
 *   set QA_PASSWORD=your-password
 *   node live-qa-agent-auth.mjs https://your-site.com 12 --config login.json
 *
 * login.json shape:
 * {
 *   "loginUrl": "https://your-site.com/login",
 *   "usernameSelector": "#email",
 *   "passwordSelector": "#password",
 *   "submitSelector": "button[type=submit]",
 *   "successSelector": ".dashboard, [data-testid=account-menu]"
 * }
 *
 * If you skip --config, the agent crawls without logging in (same as the
 * plain live-qa-agent.mjs, but using a real browser instead of plain fetch,
 * so it also sees JavaScript-rendered content).
 */
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const startUrl = args[0];
const maxPagesArg = (args[1] || "12").toString().toLowerCase();
const maxPages = maxPagesArg === "all" || maxPagesArg === "0" ? Infinity : Number(maxPagesArg);
const configFlagIndex = args.indexOf("--config");
const configPath = configFlagIndex >= 0 ? args[configFlagIndex + 1] : null;
const timeoutMs = Number(process.env.QA_TIMEOUT_MS || 15000);
const crawlDelayMs = Number(process.env.QA_CRAWL_DELAY_MS || 200);

if (!startUrl) {
  console.log("Usage: node live-qa-agent-auth.mjs https://your-site.com [maxPages] [--config login.json]");
  process.exit(1);
}

const root = new URL(startUrl);

function sameOrigin(url) {
  try { return new URL(url).origin === root.origin; } catch { return false; }
}
function escapeReport(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

async function loadLoginConfig() {
  if (!configPath) return null;
  try {
    const raw = await readFile(configPath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Could not read login config at ${configPath}: ${error.message}`);
    process.exit(1);
  }
}

async function login(page, config) {
  const username = process.env.QA_USERNAME;
  const password = process.env.QA_PASSWORD;
  if (!username || !password) {
    console.error("Set QA_USERNAME and QA_PASSWORD environment variables before using --config.");
    process.exit(1);
  }
  console.log(`Logging in at ${config.loginUrl} ...`);
  await page.goto(config.loginUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page.fill(config.usernameSelector, username);
  await page.fill(config.passwordSelector, password);
  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {}),
    page.click(config.submitSelector)
  ]);
  if (config.successSelector) {
    const success = await page.locator(config.successSelector).first().isVisible({ timeout: timeoutMs }).catch(() => false);
    if (!success) {
      console.error("Login did not reach the expected success state (successSelector not visible). Check your selectors and credentials.");
      process.exit(1);
    }
  }
  console.log("Login looks successful. Starting authenticated crawl.");
}

async function run() {
  const config = await loadLoginConfig();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: false });
  const page = await context.newPage();

  const issues = [];
  const consoleErrorsByUrl = new Map();
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const url = page.url();
    const list = consoleErrorsByUrl.get(url) || [];
    list.push(message.text().slice(0, 200));
    consoleErrorsByUrl.set(url, list);
  });

  if (config) await login(page, config);

  const queue = [root.href];
  const seen = new Set();
  const pages = [];

  try {
    const sitemapResponse = await page.request.get(`${root.origin}/sitemap.xml`, { timeout: timeoutMs }).catch(() => null);
    if (sitemapResponse && sitemapResponse.ok()) {
      const body = await sitemapResponse.text();
      const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => match[1].trim()).filter(sameOrigin);
      if (locs.length) {
        console.log(`Found ${locs.length} URL(s) in sitemap.xml`);
        locs.forEach((url) => { if (!queue.includes(url)) queue.push(url); });
      }
    }
  } catch {
    // sitemap is optional - ignore failures
  }

  if (!Number.isFinite(maxPages)) {
    console.log("Crawling the entire site (no page limit) - this may take a while on large sites.");
  }

  while (queue.length && seen.size < maxPages) {
    const target = queue.shift();
    if (!target || seen.has(target) || !sameOrigin(target)) continue;
    seen.add(target);
    if (crawlDelayMs) await new Promise((resolve) => setTimeout(resolve, crawlDelayMs));

    const started = Date.now();
    let response;
    try {
      response = await page.goto(target, { waitUntil: "networkidle", timeout: timeoutMs });
    } catch (error) {
      issues.push({ level: "critical", url: target, message: `Page failed to load: ${error.message}` });
      pages.push({ url: target, status: 0, responseMs: Date.now() - started, title: "", linkCount: 0, brokenImageCount: 0, consoleErrors: 0 });
      continue;
    }
    const elapsedMs = Date.now() - started;
    const status = response ? response.status() : 0;

    if (status >= 400) issues.push({ level: "critical", url: target, message: `Page returned HTTP ${status}` });
    if (elapsedMs > 4000) issues.push({ level: "warning", url: target, message: `Slow page load: ${elapsedMs} ms` });

    const title = await page.title();
    if (!title) issues.push({ level: "warning", url: target, message: "Missing page title" });

    const hasViewport = await page.locator('meta[name="viewport"]').count();
    if (!hasViewport) issues.push({ level: "warning", url: target, message: "Missing responsive viewport meta tag" });

    const brokenImages = await page.evaluate(() =>
      [...document.querySelectorAll("img")].filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.src)
    );
    brokenImages.slice(0, 10).forEach((src) => issues.push({ level: "critical", url: target, message: `Broken image: ${src}` }));

    const formsWithoutSubmit = await page.evaluate(() =>
      [...document.querySelectorAll("form")].filter((form) => !form.querySelector('button[type=submit], input[type=submit]')).length
    );
    if (formsWithoutSubmit) issues.push({ level: "warning", url: target, message: `${formsWithoutSubmit} form(s) do not appear to have a submit button` });

    const consoleErrors = consoleErrorsByUrl.get(target) || consoleErrorsByUrl.get(response?.url()) || [];
    consoleErrors.slice(0, 5).forEach((text) => issues.push({ level: "warning", url: target, message: `Console error: ${text}` }));

    const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.href));
    const uniqueLinks = [...new Set(links)].filter(sameOrigin);
    uniqueLinks.forEach((link) => {
      const path = new URL(link).pathname;
      if (!seen.has(link) && !/\.(png|jpg|jpeg|gif|webp|svg|css|js|pdf|zip|ico)$/i.test(path)) queue.push(link);
    });

    pages.push({ url: target, status, responseMs: elapsedMs, title, linkCount: uniqueLinks.length, brokenImageCount: brokenImages.length, consoleErrors: consoleErrors.length });
    console.log(`Checked ${target} (${status}, ${elapsedMs} ms)`);
  }

  await browser.close();

  const critical = issues.filter((i) => i.level === "critical").length;
  const warnings = issues.filter((i) => i.level === "warning").length;
  const score = Math.max(0, 100 - critical * 22 - warnings * 6);

  const report = {
    startUrl: root.href,
    authenticated: Boolean(config),
    checkedAt: new Date().toISOString(),
    score,
    pages,
    issues,
    summary: {
      pagesChecked: pages.length,
      criticalIssues: critical,
      warnings,
      averageResponseMs: pages.length ? Math.round(pages.reduce((sum, p) => sum + p.responseMs, 0) / pages.length) : 0
    }
  };

  await writeFile("qa-live-report.json", JSON.stringify(report, null, 2));
  await writeFile("qa-live-report.html", htmlReport(report));

  console.log(`\nLive QA score: ${report.score}%`);
  console.log(`Authenticated: ${report.authenticated}`);
  console.log(`Pages checked: ${report.summary.pagesChecked}`);
  console.log(`Critical issues: ${report.summary.criticalIssues}`);
  console.log(`Warnings: ${report.summary.warnings}`);
  console.log("Reports: qa-live-report.json and qa-live-report.html");
}

function htmlReport(report) {
  const issueRows = report.issues.map((issue) => `<tr><td>${issue.level}</td><td>${escapeReport(issue.url)}</td><td>${escapeReport(issue.message)}</td></tr>`).join("") || `<tr><td colspan="3">No issues found</td></tr>`;
  const pageRows = report.pages.map((page) => `<tr><td>${escapeReport(page.url)}</td><td>${page.status}</td><td>${page.responseMs} ms</td><td>${escapeReport(page.title || "Untitled")}</td><td>${page.linkCount}</td><td>${page.brokenImageCount}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Live QA Report</title><style>body{font-family:Segoe UI,Arial,sans-serif;margin:28px;background:#f4f6f8;color:#17202a}main{max-width:1180px;margin:auto}section{background:white;border:1px solid #d9dee7;border-radius:8px;padding:18px;margin:16px 0}h1,h2{margin:0 0 12px}.score{font-size:44px;font-weight:800}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #edf0f5;text-align:left;vertical-align:top}th{font-size:12px;text-transform:uppercase;color:#667085}.badge{display:inline-block;padding:3px 9px;border-radius:999px;font-size:12px;font-weight:700;background:#e0f2fe;color:#075985}</style></head><body><main><h1>Live QA Report</h1><section><div class="score">${report.score}%</div><p>${escapeReport(report.startUrl)} checked on ${escapeReport(report.checkedAt)} <span class="badge">${report.authenticated ? "Authenticated" : "Public"}</span></p><p>${report.pages.length} pages checked, ${report.issues.length} issues found.</p></section><section><h2>Issues</h2><table><thead><tr><th>Level</th><th>URL</th><th>Message</th></tr></thead><tbody>${issueRows}</tbody></table></section><section><h2>Pages</h2><table><thead><tr><th>URL</th><th>Status</th><th>Time</th><th>Title</th><th>Links</th><th>Broken Images</th></tr></thead><tbody>${pageRows}</tbody></table></section></main></body></html>`;
}

run().catch((error) => {
  console.error("Live QA agent failed:", error.message);
  process.exit(1);
});
