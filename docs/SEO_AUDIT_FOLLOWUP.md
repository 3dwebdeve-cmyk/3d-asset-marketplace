# SEOptimer homepage audit follow-up — 22 October 2026

Target: https://assethive3d.com/. The supplied SEOptimer report URL presents a Cloudflare challenge to automated access. Findings below use the supplied recommendation screenshot, the live homepage HTML and repository checks; they do not claim a new SEOptimer score.

## Changes prepared

- Changed the homepage title to `Download Furniture & Interior 3D Models | AssetHive3D` in the app, static shell and Worker metadata.
- Added shared buying guidance, category links and FAQs to the visible homepage and its initial HTML response. Previously the live first response contained only a short description and a navigation list.
- Made the first homepage heading match the visible hero. Added a section heading before the service cards so their H3 headings follow an H2.
- Added descriptive alternatives to category, model, plugin and service-preview images. Decorative art retains empty alt attributes deliberately.
- Named product and plugin image links explicitly. Added contextual category, compatibility and custom-project links in the guide.
- Added explicit dimensions to homepage service images, offering images, product/plugin cards and navigation/footer logos. Existing lazy loading remains in place for below-the-fold imagery.

## Recommendation coverage

| Screenshot recommendation | Disposition |
| --- | --- |
| Execute a link building strategy | External work: earn relevant links through genuine partnerships, product showcases and useful content. No backlinks were purchased or created. |
| Increase length of title tag | Updated to a descriptive 53-character homepage title. |
| Improve heading structure | Updated homepage H1 and H2/H3 hierarchy. |
| Add alt attributes to all images | Improved informative image descriptions; decorative images correctly use empty alt. |
| Improve link anchor text | Added descriptive internal links and named thumbnail links. |
| Increase page text content | Added useful buying guidance and FAQs, shared with the first HTML response. |
| Reduce rendered content | No relevant content hidden to satisfy a generic checker. Measure the actual page after deployment; the new guide is lightweight HTML without another client library. |
| Optimize images | Responsive 640/1000-pixel WebP category images and the WebP homepage hero already exist. Added missing dimensions and retained lazy loading. Further compression needs measurements from the deployed build. |
| Optimize for Mobile PageSpeed Insights | Preserved responsive layout and lazy loading; the new guide stacks on smaller screens. Re-run mobile Lighthouse/PageSpeed on the deployed release. No score increase claimed. |
| Defer render-blocking resources | App JavaScript already uses module scripts; fonts are self-hosted. Do not defer the main stylesheet or remove important font/hero preloads without measuring first. |
| Add SPF mail record | Needs access to the domain DNS and the actual sending provider. Use the provider's exact SPF value; never publish guessed includes or a second SPF record. See `EMAIL_DOMAIN_SETUP.md`. |
| Add business address and phone | Owner has no confirmed public details; none invented or published. |
| Add LocalBusiness schema | Not added: a digital marketplace does not automatically qualify as a local business. Existing Organization and WebSite data retained. |
| Implement analytics | Pending a provider/account and tracking identifier; owner currently has none. |
| Create/link Facebook page | Pending an official owner-created account and URL. |
| Create/link X profile | Pending an official owner-created account and URL. |
| Create/link Instagram profile | Pending an official owner-created account and URL. |
| Create/link LinkedIn profile | Pending an official owner-created account and URL. |
| Create/link YouTube channel | Pending an official owner-created account and URL. |
| Install Facebook Pixel | Optional advertising setup; no pixel/account exists. No unsolicited tracking installed. |
| Utilize browser caching | Already configured: hashed assets and fonts cache for one year; images cache for a day with stale revalidation. HTML revalidates. See `frontend/public/_headers`. |
| Add explicit width and height to images | Added to the homepage images and shared cards/logos missing them. |

## After deployment

These are local code changes until published. Deploy the tested frontend and Worker together so the initial response includes the new content. Then re-run SEOptimer and mobile PageSpeed Insights against the same canonical homepage. Compare the actual individual checks rather than expecting every recommendation to disappear.

The Contact page currently contains `support@3dhub.com`. Confirm ownership before treating it as the site's official contact or adding it to structured data or DNS configuration.

References:

- [Google JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google image SEO guidance](https://developers.google.com/search/docs/appearance/google-images)
- [Google crawlable links and anchor text](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)
