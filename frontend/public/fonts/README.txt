Self-hosted web fonts (SIL Open Font License 1.1)

Inter, Libre Baskerville, Plus Jakarta Sans and Poppins, copied from Google Fonts so the site
no longer loads anything from Google's font servers (faster, cacheable for a year, and visitors'
addresses are not sent to Google). The @font-face rules are in src/styles/fonts.css.

Only the "latin" and "latin-ext" subsets are kept. The latin-ext files are only downloaded when a
page shows characters outside the latin range (for example some accented names).

To update a font: give the new file a NEW name (the files are cached for a year), fetch the current CSS from fonts.googleapis.com/css2 with a modern browser
user agent, download the woff2 files for the two subsets, and keep the same file names.
