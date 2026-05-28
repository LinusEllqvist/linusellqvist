# linusellqvist.com

Personal CV — single static HTML page.

## Stack

Plain HTML + CSS + JS. No build step, no dependencies.

## Deploy

Pushes to `main` deploy automatically via GitHub Actions → GitHub Pages.

### One-time GitHub setup

1. Create a public repo (e.g. `linusellqvist.com`) and push these files to `main`.
2. **Settings → Pages → Build and deployment → Source:** `GitHub Actions`.
3. **Settings → Pages → Custom domain:** `linusellqvist.com` → Save.
4. Tick **Enforce HTTPS** once the SSL certificate finishes provisioning (~15 min).

### DNS at IONOS

Point the domain at GitHub Pages. In the IONOS DNS panel:

| Type  | Host | Value             |
|-------|------|-------------------|
| A     | @    | 185.199.108.153   |
| A     | @    | 185.199.109.153   |
| A     | @    | 185.199.110.153   |
| A     | @    | 185.199.111.153   |
| AAAA  | @    | 2606:50c0:8000::153 |
| AAAA  | @    | 2606:50c0:8001::153 |
| AAAA  | @    | 2606:50c0:8002::153 |
| AAAA  | @    | 2606:50c0:8003::153 |
| CNAME | www  | `<yourgithubuser>.github.io.` |

After DNS propagates (a few minutes to a few hours), GitHub Pages auto-provisions
a Let's Encrypt cert.

## Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Files

| File                       | Purpose                                    |
|----------------------------|--------------------------------------------|
| `index.html`               | The CV page                                |
| `favicon.svg`              | Vector favicon (modern browsers)           |
| `favicon.ico`              | Fallback favicon (legacy browsers)         |
| `apple-touch-icon.png`     | iOS home-screen icon (180×180)             |
| `og-image.png`             | Social preview (1200×630)                  |
| `robots.txt`               | Crawler rules; blocks common AI scrapers   |
| `sitemap.xml`              | Search engine sitemap                      |
| `CNAME`                    | GitHub Pages custom domain marker          |
| `.github/workflows/deploy.yml` | Auto-deploy on push to `main`          |

## Security notes

CSP, Referrer-Policy, and Permissions-Policy are set via `<meta>` tags. For full
security headers (`X-Content-Type-Options`, `Strict-Transport-Security`,
`X-Frame-Options`), put the site behind Cloudflare (free) and use a Transform
Rule to inject them — GitHub Pages cannot set arbitrary HTTP headers.
