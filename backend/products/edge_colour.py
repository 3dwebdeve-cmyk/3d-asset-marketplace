"""Side colours for render letterboxing, sampled once when an image is stored.

The product page fills the empty sides beside a render with a colour taken from the top of
the render's own side edges. Sampling here means the page never downloads the image just to
find that colour.
"""

from __future__ import annotations

import urllib.request
from io import BytesIO

from PIL import Image, ImageStat, UnidentifiedImageError

# Sampling works on a small copy, so a full-size render costs little to read.
SAMPLE_MAX_SIZE = 256
# Share of the image width and height read from each side edge, starting at the top.
SAMPLE_BAND_WIDTH = 0.04
SAMPLE_BAND_HEIGHT = 0.2
# Keep the sampled colour a little less saturated than the photo's own edge.
SIDE_MUTE = 0.6
# Stop downloading an image for colour sampling past this size.
FETCH_MAX_BYTES = 25 * 1024 * 1024
FETCH_TIMEOUT_SECONDS = 10

SideColours = tuple[str, str]


def _mute(channel: float, luminance: float) -> int:
    return round(min(255.0, max(0.0, luminance + (channel - luminance) * SIDE_MUTE)))


def _to_muted_hex(rgb: tuple[float, float, float]) -> str:
    red, green, blue = rgb
    luminance = 0.299 * red + 0.587 * green + 0.114 * blue
    return "#{:02x}{:02x}{:02x}".format(
        _mute(red, luminance), _mute(green, luminance), _mute(blue, luminance)
    )


def sample_side_colours(data: bytes) -> SideColours | None:
    """Return the muted left and right side colours as hex strings, or None if unreadable."""
    try:
        with Image.open(BytesIO(data)) as source:
            image = source.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        return None

    image.thumbnail((SAMPLE_MAX_SIZE, SAMPLE_MAX_SIZE))
    width, height = image.size
    band_width = max(1, round(width * SAMPLE_BAND_WIDTH))
    band_height = max(1, round(height * SAMPLE_BAND_HEIGHT))

    left = ImageStat.Stat(image.crop((0, 0, band_width, band_height))).mean[:3]
    right = ImageStat.Stat(image.crop((width - band_width, 0, width, band_height))).mean[:3]
    return _to_muted_hex(tuple(left)), _to_muted_hex(tuple(right))


def fetch_side_colours(url: str) -> SideColours | None:
    """Download a public image and sample it. Best-effort: any failure returns None."""
    try:
        with urllib.request.urlopen(url, timeout=FETCH_TIMEOUT_SECONDS) as response:
            data = response.read(FETCH_MAX_BYTES + 1)
    except (OSError, ValueError):
        return None
    if len(data) > FETCH_MAX_BYTES:
        return None
    return sample_side_colours(data)
