# Model discovery and SEO release

Deploy the backend and frontend together (backend first). The free collection and homepage
use the public products API's `is_free=true` filter, applied before pagination. This change
requires no database migration.

The frontend Worker now serves public model links, images, descriptions and product
specifications in its initial HTML. The browser retains the existing catalog design.
Model collections use 12 items per numbered page, self-referencing page canonicals and
ordinary previous/next links. Search, filter and alternate-sort views use `noindex, follow`.
Old `/3d-models?max_price=0` links redirect to `/free-3d-models` while retaining other filters.
The free collection enters the sitemap only when it contains published models.

Product pages show verified package formats, software, geometry counts, traits, licenses
and download size. Missing specifications remain omitted. When images exist, product
pages start with an image; selecting the 3D thumbnail loads the interactive viewer.

After deployment:

1. Inspect the homepage, `/free-3d-models`, a populated category, and a product in Google
   Search Console. Check rendered content and Google's selected canonical URL.
2. Submit `/sitemap.xml`, then request indexing for the main collection pages.
3. Check `/3d-models?page=2` on a catalog with more than 12 models: distinct models,
   a canonical containing `?page=2`, and a link back to page one.
4. Confirm search/filter pages are excluded from indexing, and missing products or
   out-of-range catalog pages return HTTP 404.
5. Track search impressions, clicks and relevant queries over time. These changes
   improve discovery and presentation; they do not guarantee indexing or ranking.
