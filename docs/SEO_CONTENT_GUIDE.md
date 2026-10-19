# SEO content guide

How the site tells search engines what it is, and how to write product and category content so the
right people find it. Focus: furniture and interior 3D models.

## What the site does by itself

| Item | How |
|---|---|
| Page title, description and social card | Every public page sets its own (`src/hooks/useDocumentSeo.ts`). Link-preview defaults are in `index.html`. |
| Category pages | `/3d-models/<slug>` (for example `/3d-models/furniture`), each with its own heading, introduction, title and description (`src/lib/categorySeo.ts`). Old `?category=<id>` links redirect to them. |
| Product pages | Title `{name} – {category} 3D Model`, a description, a canonical address, and schema.org Product data with price, currency and rating (only when reviews exist). |
| Breadcrumbs, item lists, organisation | Structured data on the pages that have them. |
| Sitemap | `/sitemap.xml`, built from the database. Lists published products and plugins in active categories, and categories that have at least one product. Placeholder (demo) items and empty categories are left out. |
| `robots.txt` | Static rules plus a `Sitemap:` line using the address the visitor used. |
| Not indexed on purpose | Search result pages, empty categories, demo items, cart, checkout, account, login, admin, "not found". |

## What only a person can do

### Product copy (entered in the admin console)

Each product needs its own text. Search engines ignore pages that repeat the same wording.

- **Name:** the thing, with its most useful attribute. `Mid-Century Oak Armchair`, not `Chair 02`.
  The page title adds "3D Model" and the category for you, so do not repeat them in the name.
- **Short description (keep it under 155 characters):** what it is and what a buyer needs to know.
  `Mid-century oak armchair for interior visualization. 12,000 polygons, PBR textures, Blender and FBX.`
  If it is left empty, the site builds one from the category, polygon count and license, and nothing else.
- **Long description:** four short parts: what the model is; the specs (polygon count, texture
  resolution, PBR, scale and units, rigging if any); what is in the package (formats, textures);
  and compatible software. Plain sentences. No keyword lists.
- **Category:** choose the most specific one (Furniture, Interior, Lights, Plants).
- **Images:** the first is used as the link-preview picture, so make it the clearest view. Name files
  in lower case with hyphens (`oak-armchair-front.jpg`). The site writes the image description
  (`{name} 3D model, image 2`) for you.

### Words that bring the right searches

Write what a buyer would type, in natural sentences, once or twice per page:

- Furniture: furniture 3D model, chair 3D model, sofa 3D model, table 3D model, low poly furniture
- Interior: interior 3D models, interior visualization models, home décor 3D models
- Lighting and plants: lamp 3D model, pendant light 3D model, indoor plant 3D model
- Technical: PBR, polygon count, GLB, FBX, Blender, game-ready (only where true for that model)

### Things not to do

- Do not claim anything you cannot show: no "best", "largest", "#1", "cheapest", "unlimited", and no
  "free" while no model is free. Search engines and buyers both punish it, and in some places it breaks
  advertising rules.
- Do not paste the same description onto many products.
- Do not stuff keywords. One clear sentence beats ten repeated words.

## When the real domain is attached

1. Cloudflare → the Worker → build settings: set `VITE_SITE_URL` to the domain (for example
   `https://assethive3d.com`), then rebuild. This fills the link-preview address in `index.html`
   and every canonical link.
2. Render → set `FRONTEND_BASE_URL` to the same address, so `/sitemap.xml` lists the right addresses.
3. Turn the `workers.dev` address off, so there is one copy of every page.

## After launch

1. Add the site in **Google Search Console** (verify with a DNS record) and submit `/sitemap.xml`.
   Do the same in **Bing Webmaster Tools**.
2. Use "URL inspection" on the home page, one category and one product. Check that Google sees the
   title, text and structured data.
3. Test a product page in Google's **Rich Results Test**.
4. Look at Search Console → Pages weekly: anything marked "Crawled, currently not indexed" usually
   means thin or repeated text.

## Honest expectations

A new site does not appear on the first page of "3D models" searches. Large sites have years of
history. Specific searches (a style plus a furniture type, "interior visualization models") are where
a new shop is found first, and results usually take months. Unique product pages and a growing
catalog matter most.

## Not done yet (optional second step)

The site loads its content in the browser. Google reads that, but slowly, and Facebook, LinkedIn
and similar sites show only the generic card from `index.html` for any link. If link previews matter,
the Worker can later send ready-made titles, descriptions and product data in the first response.
