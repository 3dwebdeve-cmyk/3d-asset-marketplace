# AssetHive3D domain launch

Primary public origin: `https://assethive3d.com`.

## Deployment

- Deploy the frontend from `frontend` using `npm run deploy` with access to the existing Cloudflare account.
- The committed `.env.production` sets browser canonical and structured-data URLs. Vite also loads it for static social preview images.
- Wrangler sets `SITE_URL` for server-rendered canonical, social, structured-data and robots sitemap URLs. Preserve existing `BACKEND_ORIGIN` and Worker secrets.
- Set the backend's `FRONTEND_BASE_URL=https://assethive3d.com`. Include the actual frontend origin in its CORS/CSRF configuration where needed. Check Google sign-in authorized origins and payment return URL settings for the new domain.
- The Worker publishes backend sitemap entries on the canonical origin while preserving catalog paths and exclusions. Backend failures remain errors; no incomplete fallback is advertised.
- Both root and www must be connected to the production Worker with valid HTTPS certificates. Configure a permanent www-to-root redirect in Cloudflare, preserving path and query string, after testing the root domain. Preview environments should remain separately controlled.

## Verify after deployment

- View page source on `/`, `/3d-models`, `/custom-projects`, a populated category, a real product and a plugin: unique title and description, root-domain canonical and social URLs, valid JSON-LD. Check again after JavaScript runs.
- Addresses that do not exist answer **404** with a noindex "not found" page: an unknown path
  (`/nothing-here`), product, plugin or category. `curl -sI https://assethive3d.com/nothing-here`
  shows `HTTP/2 404`. The Worker knows the app's pages from `frontend/worker/routes.ts`; when a
  new page is added to `src/App.tsx`, add it there too (a test fails until you do).
- `/robots.txt` should link to `https://assethive3d.com/sitemap.xml` and allow public crawling; private account and checkout paths remain excluded.
- `/sitemap.xml` should return XML with only intended public catalog pages and the new hostname. Demo and empty categories are excluded by the backend.
- Verify the social image at `/og-default.jpg`, actual product images, mobile layout, real product content and checkout on the new domain.
- Inspect Google Rich Results Test and Search Console URL Inspection. Add the domain property in Google Search Console using its DNS TXT verification record, then submit `https://assethive3d.com/sitemap.xml`.
- Check Cloudflare security events for genuine blocked crawlers before changing bot rules. Robots permission is not a guarantee of indexing or recommendations.

Domain connection alone does not deploy repository changes. Search discovery and rankings depend on published content, crawl access and search-engine processing; there is no guaranteed SEO score or ranking.
