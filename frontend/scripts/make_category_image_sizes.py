"""Make 640 px and 1000 px WebP copies of the category card images (same aspect ratio, no crop).

Run from frontend/:  python scripts/make_category_image_sizes.py public
See docs/STATIC_ASSETS.md."""
import sys
from pathlib import Path
from PIL import Image

public = Path(sys.argv[1])
sources = sorted((public / "catego image").glob("*.webp")) + [public / "homepage images/aaa/household.webp"]
sources = [s for s in sources if not any(s.stem.endswith(f"-{w}") for w in (640, 1000))]
before = after = 0
for src in sources:
    before += src.stat().st_size
    with Image.open(src) as im:
        im.load()
        w, h = im.size
        for width in (640, 1000):
            height = round(h * width / w)
            out = src.with_name(f"{src.stem}-{width}.webp")
            im.convert("RGB").resize((width, height), Image.LANCZOS).save(out, "WEBP", quality=80, method=6)
            after += out.stat().st_size
    print(f"{src.stat().st_size // 1024:>4} KB ({w}x{h}) -> " + "  ".join(f"{(src.with_name(f'{src.stem}-{x}.webp')).stat().st_size // 1024}KB@{x}" for x in (640, 1000)) + f"   {src.name}")
print(f"\n{len(sources)} images: originals {before / 1048576:.2f} MB -> variants {after / 1048576:.2f} MB total (both sizes); a visitor loads ONE per card")
