"""Upscale the exact site banner file (no crop, no alternate source).

Note: production serves site-hero-banner.webp. Convert back to WebP after editing.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter

PUBLIC = Path(r"E:\ABHAY\Project\3d-asset-marketplace\frontend\public\images")
SRC = PUBLIC / "site-hero-banner.webp"
OUT = PUBLIC / "site-hero-banner.webp"

TARGET_W = 4096
TARGET_H = 984  # exact 4x of 1024x246


def main() -> None:
    src = Image.open(SRC).convert("RGB")
    print(f"source: {src.width}x{src.height}")

    if (src.width, src.height) != (1024, 246):
        # Preserve framing: scale by width, then force exact target size
        scaled = src.resize(
            (TARGET_W, max(1, int(round(src.height * (TARGET_W / src.width))))),
            Image.Resampling.LANCZOS,
        )
        img = scaled.resize((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)
    else:
        img = src.resize((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)

    img = img.filter(ImageFilter.UnsharpMask(radius=1.4, percent=110, threshold=2))
    img.save(
        OUT,
        quality=95,
        optimize=True,
        progressive=True,
        subsampling=0,
    )
    print(f"wrote {OUT} {OUT.stat().st_size / 1024:.0f}KB {TARGET_W}x{TARGET_H}")


if __name__ == "__main__":
    main()
