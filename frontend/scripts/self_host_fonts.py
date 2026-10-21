"""Download the Google Fonts faces the site uses (latin + latin-ext) and write local @font-face rules.

Usage: python scripts/self_host_fonts.py <google.css> public/fonts src/styles/fonts.css
where google.css is the css2 stylesheet fetched with a modern browser user agent.
See docs/STATIC_ASSETS.md."""

import re
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

css_path = Path(sys.argv[1])          # google.css saved with a Chrome user agent
out_fonts = Path(sys.argv[2])         # frontend/public/fonts
out_css = Path(sys.argv[3])           # frontend/src/styles/fonts.css
KEEP = {"latin", "latin-ext"}

text = css_path.read_text(encoding="utf-8")
blocks = re.findall(r"/\*\s*([a-z-]+)\s*\*/\s*@font-face\s*\{(.*?)\}", text, re.S)

faces = []
for subset, body in blocks:
    if subset not in KEEP:
        continue
    fam = re.search(r"font-family:\s*'([^']+)'", body).group(1)
    weight = re.search(r"font-weight:\s*(\d+)", body).group(1)
    style = re.search(r"font-style:\s*(\w+)", body).group(1)
    url = re.search(r"url\((https://[^)]+\.woff2)\)", body).group(1)
    rng = re.search(r"unicode-range:\s*([^;]+);", body).group(1).strip()
    faces.append(dict(fam=fam, subset=subset, weight=weight, style=style, url=url, range=rng))

# One file per distinct URL. Name by family + subset, and add the weight only when a family
# uses different files for different weights (Poppins), so shared variable files stay shared.
urls_by_group = defaultdict(set)
for f in faces:
    urls_by_group[(f["fam"], f["subset"])].add(f["url"])


def kebab(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


names = {}
for f in faces:
    key = (f["fam"], f["subset"])
    base = f"{kebab(f['fam'])}-{f['subset']}"
    if len(urls_by_group[key]) > 1:
        base += f"-{f['weight']}"
    names.setdefault(f["url"], base + ".woff2")
    f["file"] = names[f["url"]]

out_fonts.mkdir(parents=True, exist_ok=True)
total = 0
for url, name in sorted(names.items(), key=lambda kv: kv[1]):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 Chrome/130"})
    data = urllib.request.urlopen(req, timeout=30).read()
    (out_fonts / name).write_bytes(data)
    total += len(data)
    print(f"{len(data) / 1024:6.1f} KB  {name}")
print(f"{len(names)} files, {total / 1024:.0f} KB total")

lines = [
    "/* Self-hosted copies of the Google Fonts faces the site used (SIL Open Font License).",
    "   Same families, weights and unicode ranges as before, so pages look identical.",
    "   Files live in public/fonts/. The latin faces cover English text; latin-ext covers accents",
    "   and is only downloaded when such characters appear. See public/fonts/README.txt. */",
]
order = {"latin": 0, "latin-ext": 1}
for f in sorted(faces, key=lambda x: (x["fam"], int(x["weight"]), order[x["subset"]])):
    lines += [
        f"/* {f['subset']} */",
        "@font-face {",
        f"  font-family: '{f['fam']}';",
        f"  font-style: {f['style']};",
        f"  font-weight: {f['weight']};",
        "  font-display: swap;",
        f"  src: url('/fonts/{f['file']}') format('woff2');",
        f"  unicode-range: {f['range']};",
        "}",
    ]
out_css.write_text("\n".join(lines) + "\n", encoding="utf-8")
print("faces:", len(faces), "->", out_css)
