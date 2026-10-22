"""Legacy manual converter. Vite now converts public PNG/JPEGs automatically via
scripts/automaticWebp.ts during development and production builds. Use this script
only when standalone WebP copies beside the originals are specifically needed.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageOps


def convert_png(source: Path, *, quality: int) -> tuple[Path, int, int]:
    destination = source.with_suffix(".webp")
    original_size = source.stat().st_size
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened)
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGBA" if "transparency" in image.info else "RGB")
        image.save(
            destination,
            format="WEBP",
            quality=quality,
            method=6,
            exact=image.mode == "RGBA",
        )
    return destination, original_size, destination.stat().st_size


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--quality", type=int, default=82)
    args = parser.parse_args()

    public = Path(__file__).resolve().parents[1] / "public"
    png_files = sorted(public.rglob("*.png"))
    original_total = 0
    webp_total = 0
    for source in png_files:
        destination, original_size, webp_size = convert_png(
            source, quality=args.quality
        )
        original_total += original_size
        webp_total += webp_size
        print(
            f"{source.relative_to(public)} -> {destination.relative_to(public)} "
            f"({original_size} -> {webp_size} bytes)"
        )

    saving = original_total - webp_total
    percent = (saving / original_total * 100) if original_total else 0
    print(
        f"Converted {len(png_files)} PNGs: {original_total} -> {webp_total} bytes "
        f"({percent:.1f}% smaller)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
