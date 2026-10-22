# Static files: images, fonts, video and caching

How the files the pages download are stored, cached and updated. The cache rules live in
`frontend/public/_headers`; a test (`frontend/worker/index.test.ts`) checks them.

## What the browser keeps, and for how long

| Files | Rule | Why |
|---|---|---|
| `/assets/*` (the built JS and CSS) | 1 year, `immutable` | Their names carry a hash, so a changed file gets a new name. |
| `/fonts/*` | 1 year, `immutable` | Never change under the same name (see "Fonts"). |
| Images, `.glb`, `.hdr`, `.mp4` | 1 day, then a background refresh for up to a week | They keep their names when replaced. |
| Pages (HTML) | Always check | A new release must show at once. |

**Replacing an image under the same name** can show the old one to returning visitors for up to a
day (a week in the background-refresh case). If it matters, give the new file a new name, or add a
version to the address (`/images/contact-hero.webp?v=3`) and update the code that uses it.

## Automatic WebP conversion

Add PNG, JPG or JPEG images anywhere inside `frontend/public/`. During `npm run dev`,
new and changed files are converted automatically and the browser reloads. Images
added while the server is stopped are converted on its next start. `npm run build`
also performs conversion, so CI and deployments need no Python installation.

`frontend/scripts/automaticWebp.ts` uses Sharp at quality 82, preserving transparency
for pop-out banners, image dimensions and animation frames. Converted bytes are
cached under `node_modules/.vite/automatic-webp` and emitted as content-hashed
`dist/_webp/*.webp` files. Originals are preserved; no source files are rewritten.
Existing local image URL literals in TS/JS, HTML and CSS are rewritten by Vite to
the generated assets, including URL-encoded filenames. Use a root-relative literal
such as `/banners/my-photo.png` when adding a static image. Dynamically assembled
URLs, external URLs and social-preview absolute URLs retain their original format.
SVG and existing WebP files are left as-is. Website uploads continue to use the
backend's existing WebP conversion independently of this static asset pipeline.

The older `optimize_static_images.py` is an optional manual export utility; it is
not needed for normal development/builds. Category resizing remains a separate
step because automatic conversion preserves the original dimensions.

## Category card images

Each local category image has two copies next to it, `name-640.webp` and `name-1000.webp`; the card
picks the one it needs (`srcset`). The big original is not kept in the repo.

1. Put the full-size WebP in `frontend/public/catego image/` (or `homepage images/aaa/` for
   Household) and add it to `LOCAL_CATEGORY_IMAGES` in `src/components/categoryImages.ts`.
2. From `frontend/`: `python scripts/make_category_image_sizes.py public` (needs Pillow).
3. Delete the full-size file again. A test fails if either copy is missing.

## Fonts

Inter, Libre Baskerville, Plus Jakarta Sans and Poppins are served from `frontend/public/fonts/`
(SIL Open Font License), with the rules in `src/styles/fonts.css`. Nothing is loaded from Google, and
the security policy no longer lists Google's font servers.

To change a font: fetch Google's `css2` stylesheet with a modern browser user agent, run
`python scripts/self_host_fonts.py <google.css> public/fonts src/styles/fonts.css`, and **give the new
files new names** (they are cached for a year).

## Preloading the main picture

A `Link: <...>; rel=preload; as=image` rule in `_headers` lets the browser start fetching a page's top
picture before the JavaScript has run. It is set only for pages whose picture is under 100 KB. In a
browser test on a slow connection the two largest pictures came out slower when fetched at high
priority, so `/3d-models` and `/custom-projects` have none. The address must match the one the page
asks for exactly; a test checks the files exist. Re-measure on the live site before adding more.

Fonts can be preloaded the same way (several preloads go on one `Link` line, separated by `, `; a
font needs `as=font; type="font/woff2"; crossorigin`). Poppins is preloaded for every page in
`index.html`; Libre Baskerville, used only by the home page title, only on `/` in `_headers`. Without
them the titles re-flowed when the font arrived and pushed the page down.

## Video

`custome project image/rolling-cubes.mp4` replaced a 425 KB animated GIF. It is silent, loops, has a
poster image, and does not autoplay for visitors who ask for reduced motion. Make new ones with
`ffmpeg -i in.gif -an -c:v libx264 -tune animation -pix_fmt yuv420p -crf 20 -movflags +faststart out.mp4`.

## Catalog API answers at the edge

The Worker keeps public catalog answers (`/api/v1/categories/`, `products/`, `plugins/`,
`plugin-categories/` and their single-item pages) in Cloudflare's cache for as long as the
backend's `s-maxage` allows (60 seconds today, never more than 5 minutes), so most visitors are
answered without waking Render. It stores an answer only when the backend marks it
`public, s-maxage=N` (`backend/config/http_cache.py`), never errors, cookies or requests that carry
a sign-in token. The `X-Edge-Cache` header says `HIT` or `MISS`. An admin change shows on the site
within about a minute. The cache only works on the real domain, not on preview links.

## Checking a change locally

`npm run build`, then `npx wrangler dev --local` serves `dist/` with the real `_headers` rules, so
`curl -I http://127.0.0.1:8787/assets/<file>` shows the headers a browser would get.
