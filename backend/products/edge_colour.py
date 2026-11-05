"""Side colours for render letterboxing, sampled once when an image is stored.

The product page fills the empty sides beside a render with a colour taken from the top of
the render's own side edges. Sampling here means the page never downloads the image just to
find that colour.
"""

from __future__ import annotations

import urllib.parse
import urllib.request
from io import BytesIO
from typing import NamedTuple

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

class SideSample(NamedTuple):
    left: str
    right: str
    # Width divided by height, so the page can size the render before the file downloads.
    aspect_ratio: float


def _mute(channel: float, luminance: float) -> int:
    return round(min(255.0, max(0.0, luminance + (channel - luminance) * SIDE_MUTE)))


def _to_muted_hex(rgb: tuple[float, float, float]) -> str:
    red, green, blue = rgb
    luminance = 0.299 * red + 0.587 * green + 0.114 * blue
    return "#{:02x}{:02x}{:02x}".format(
        _mute(red, luminance), _mute(green, luminance), _mute(blue, luminance)
    )


def sample_side_colours(data: bytes) -> SideSample | None:
    """Return the muted side colours and aspect ratio of an image, or None if unreadable."""
    try:
        with Image.open(BytesIO(data)) as source:
            image = source.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        return None

    aspect_ratio = image.width / image.height
    image.thumbnail((SAMPLE_MAX_SIZE, SAMPLE_MAX_SIZE))
    width, height = image.size
    band_width = max(1, round(width * SAMPLE_BAND_WIDTH))
    band_height = max(1, round(height * SAMPLE_BAND_HEIGHT))

    left = ImageStat.Stat(image.crop((0, 0, band_width, band_height))).mean[:3]
    right = ImageStat.Stat(image.crop((width - band_width, 0, width, band_height))).mean[:3]
    return SideSample(_to_muted_hex(tuple(left)), _to_muted_hex(tuple(right)), round(aspect_ratio, 4))


def fetch_side_colours(url: str) -> SideSample | None:
    """Download a public https image and sample it. Best-effort: any failure returns None."""
    if urllib.parse.urlsplit(url).scheme != "https":
        return None
    try:
        with urllib.request.urlopen(url, timeout=FETCH_TIMEOUT_SECONDS) as response:  # nosec B310 - https checked above
            data = response.read(FETCH_MAX_BYTES + 1)
    except (OSError, ValueError):
        return None
    if len(data) > FETCH_MAX_BYTES:
        return None
    return sample_side_colours(data)


def edge_fields(sample: SideSample | None) -> dict[str, str | float | None]:
    """Model fields for a stored image. Blank colours and no aspect ratio when sampling failed."""
    if sample is None:
        return {"edge_left_color": "", "edge_right_color": "", "aspect_ratio": None}
    return {
        "edge_left_color": sample.left,
        "edge_right_color": sample.right,
        "aspect_ratio": sample.aspect_ratio,
    }
