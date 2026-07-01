# Live QA Agent

This is the automated/live part of the QA tool. It checks a real website URL and creates a report.

There are two versions:

| Script | Best for | How it sees the page |
|---|---|---|
| `live-qa-agent.mjs` | Public pages, quick smoke tests | Plain HTTP fetch — fast, but can't see JavaScript-rendered content or log in |
| `live-qa-agent-auth.mjs` | Pages behind a login, JS-heavy sites | Real headless browser (Playwright) — can log in and see rendered content |

Use the plain version for a fast public-page check. Use the authenticated version when you need to test pages that only exist after signing in, on a site you're authorized to test, using credentials you control.

## Run the plain smoke-test agent

```powershell
node live-qa-agent.mjs https://your-company-site.com 12
```

The last number is how many same-site pages it should check. Use `all` instead of a number to crawl the entire site with no page limit:

```powershell
node live-qa-agent.mjs https://your-company-site.com all
```

Both agents also check `sitemap.xml` first (if the site has one) so they discover pages faster than link-following alone, and add a small delay between requests so a full-site crawl doesn't hammer the server. You can adjust the delay with `QA_CRAWL_DELAY_MS` (milliseconds, default 150-200ms) if you need to go slower on a sensitive site, or faster on a large one you're confident can take it.

## Run the authenticated agent (one-time setup)

```powershell
npm install playwright
npx playwright install chromium
```

Then, without logging in (just a real browser instead of fetch, so it sees JS-rendered pages):

```powershell
node live-qa-agent-auth.mjs https://your-company-site.com 12
```

With a login step, copy `login.example.json` to `login.json` and fill in the CSS selectors for your site's login form, then:

```powershell
set QA_USERNAME=your-test-account@example.com
set QA_PASSWORD=your-test-password
node live-qa-agent-auth.mjs https://your-company-site.com 12 --config login.json
```

Credentials are read from environment variables only — never put them in `login.json`, and don't commit `login.json` if it ever contains real values for a shared repo.

This only works on sites and accounts you're authorized to test. It does not bypass CAPTCHAs, bot-detection, or rate limits — if a site is actively blocking your crawler, the fix is getting allowlisted by whoever manages that site, not circumventing the protection.

## What it checks

- Page availability and HTTP errors
- Response speed
- Missing page titles
- Missing mobile viewport tag
- Basic security headers (plain agent only)
- Same-site links for crawling
- Same-site images/scripts/assets for broken responses
- Simple form risks
- Broken images and browser console errors (authenticated agent only)

## Output

After running either agent, it creates:

- `qa-live-report.html` - open this in a browser for a readable report
- `qa-live-report.json` - use this for automation, dashboards, or CI/CD

Both agents write to the same filenames, so the QA Command Center's Live Agent tab works with either one's output.

## Important

For full scripted user journeys (checkout, multi-step forms, file upload), write a dedicated Playwright script with explicit steps rather than relying on the generic crawler — the crawler is for breadth (catching broken pages/assets across the whole site), not for verifying a specific business flow.

