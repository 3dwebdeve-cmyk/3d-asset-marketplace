"""Import the supplied image-sequence Lottie HTML without running any JavaScript.

Usage: python scripts/importPreloader.py SOURCE.html public/images

The supported export has one opaque, untransformed VP8 WebP image per frame.
The original compressed image chunks are copied, never decoded or re-encoded.
Unsupported Lottie features are rejected rather than silently losing artwork.
Container reference: https://developers.google.com/speed/webp/docs/riff_container
"""

import argparse
import base64
from fractions import Fraction
import json
from pathlib import Path
import re
import struct


def require(condition, message):
    if not condition:
        raise ValueError(message)


def uint24(value):
    require(0 <= value < 2**24, "Value exceeds the WebP 24-bit field")
    return value.to_bytes(3, "little")


def chunk(name, payload):
    return name + struct.pack("<I", len(payload)) + payload + b"\0" * (len(payload) % 2)


def read_animation(source):
    matches = list(re.finditer(r"\banimationData\s*:\s*", source))
    require(len(matches) == 1, "Expected exactly one embedded animationData JSON object")
    animation, _ = json.JSONDecoder().raw_decode(source[matches[0].end():])
    require(isinstance(animation, dict), "animationData must be a JSON object")
    allowed = {"v", "meta", "fr", "ip", "op", "w", "h", "nm", "ddd", "assets", "layers", "markers"}
    require(set(animation) <= allowed, "Unsupported animation properties")
    require(animation.get("ddd", 0) == 0, "3D animation is not supported")
    require(not animation.get("markers"), "Animation markers are not supported")
    return animation


def image_chunk(raw, width, height):
    require(raw[:4] == b"RIFF" and raw[8:12] == b"WEBP", "Asset is not a WebP file")
    require(len(raw) >= 30, "Truncated WebP file")
    require(int.from_bytes(raw[4:8], "little") + 8 == len(raw), "Invalid WebP RIFF length")
    require(raw[12:16] == b"VP8 ", "Only simple opaque VP8 WebP assets are supported")
    size = int.from_bytes(raw[16:20], "little")
    require(20 + size + size % 2 == len(raw), "Extra or truncated WebP chunks")
    require(size >= 10, "Truncated VP8 header")
    require(not size % 2 or raw[-1] == 0, "Invalid RIFF padding byte")
    payload = raw[20:20 + size]
    require(payload[0] & 1 == 0 and payload[3:6] == b"\x9d\x01\x2a", "Expected a VP8 keyframe")
    # The high two bits encode scaling; require an unscaled image of the full canvas.
    require(int.from_bytes(payload[6:8], "little") == width, "VP8 width/scaling differs from canvas")
    require(int.from_bytes(payload[8:10], "little") == height, "VP8 height/scaling differs from canvas")
    return raw[12:]


def mux_animation(animation):
    width, height = animation["w"], animation["h"]
    require(type(width) is int and type(height) is int, "Canvas dimensions must be integers")
    require(0 < width <= 16383 and 0 < height <= 16383, "Unsupported VP8 canvas dimensions")
    fps = Fraction(str(animation["fr"]))
    require(fps > 0, "Frame rate must be positive")
    layers, assets = animation["layers"], animation["assets"]
    require(isinstance(layers, list) and len(layers) > 0, "Expected image layers")
    require(isinstance(assets, list), "Expected embedded assets")
    require(animation["ip"] == 0 and animation["op"] == len(layers), "Expected one layer per frame from frame zero")

    images = {}
    for asset in assets:
        require(set(asset) == {"id", "w", "h", "u", "p", "e"}, "Unsupported asset properties")
        require(asset["id"] not in images, "Duplicate asset ID")
        require(asset["w"] == width and asset["h"] == height, "Asset dimensions differ from canvas")
        require(asset["u"] == "" and asset["e"] == 1, "Only embedded image assets are supported")
        prefix = "data:image/webp;base64,"
        require(asset["p"].startswith(prefix), "Expected an embedded WebP image")
        raw = base64.b64decode(asset["p"][len(prefix):], validate=True)
        images[asset["id"]] = (raw, image_chunk(raw, width, height))

    expected_transform = {
        "o": 100, "r": 0, "p": [width / 2, height / 2, 0],
        "a": [width / 2, height / 2, 0], "s": [100, 100, 100],
    }
    layer_properties = {"ddd", "ind", "ty", "nm", "cl", "refId", "sr", "ks", "ao", "ip", "op", "st", "bm"}
    # VP8X animation flag; white background and infinite looping in ANIM.
    body = chunk(b"VP8X", b"\x02\0\0\0" + uint24(width - 1) + uint24(height - 1))
    body += chunk(b"ANIM", b"\xff\xff\xff\xff\0\0")
    still = None
    used_assets = set()
    durations = []

    for index, layer in enumerate(sorted(layers, key=lambda item: item["ip"])):
        require(set(layer) <= layer_properties, "Unsupported layer feature (such as masks, effects, parenting or remapping)")
        require(layer["ty"] == 2, "Only image layers are supported")
        require(all(layer.get(key, default) == default for key, default in {"ddd": 0, "sr": 1, "ao": 0, "bm": 0}.items()), "Unsupported layer transform or blend mode")
        require(layer["ip"] == index and layer["op"] == index + 1 and layer["st"] == index, "Expected consecutive single-frame layers without overlap or gaps")
        require(set(layer["ks"]) == set(expected_transform), "Unsupported transform properties")
        for name, expected in expected_transform.items():
            value = layer["ks"][name]
            require(set(value) <= {"a", "k", "ix"} and value.get("a") == 0 and value.get("k") == expected, "Only static identity transforms and full opacity are supported")
        require(layer["refId"] in images, "Missing image asset")
        raw, encoded_frame = images[layer["refId"]]
        used_assets.add(layer["refId"])
        if still is None:
            still = raw
        # Rounded cumulative timestamps avoid drifting from the original frame rate.
        duration = round(Fraction((index + 1) * 1000) / fps) - round(Fraction(index * 1000) / fps)
        require(10 < duration < 2**24, "Frame duration would be clamped or overflow in WebP players")
        durations.append(duration)
        # Full-canvas, no blending, no disposal; preserve the original VP8 chunk bytes.
        header = uint24(0) + uint24(0) + uint24(width - 1) + uint24(height - 1) + uint24(duration) + b"\x02"
        body += chunk(b"ANMF", header + encoded_frame)

    require(used_assets == set(images), "Unused or unsupported additional image assets")
    require(len(body) + 4 <= 2**32 - 10, "Animation exceeds the RIFF size limit")
    result = b"RIFF" + struct.pack("<I", len(body) + 4) + b"WEBP" + body
    return result, still, len(layers), sum(durations)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Original exported preloader HTML")
    parser.add_argument("output_directory", type=Path, help="Destination image directory")
    args = parser.parse_args()
    try:
        animation = read_animation(args.source.read_text(encoding="utf-8"))
        animated, still, frame_count, duration = mux_animation(animation)
    except (ValueError, KeyError, TypeError, OverflowError) as error:
        parser.error(str(error))
    args.output_directory.mkdir(parents=True, exist_ok=True)
    (args.output_directory / "assethive-preloader.webp").write_bytes(animated)
    (args.output_directory / "assethive-preloader-still.webp").write_bytes(still)
    print(f"Imported {frame_count} frames, {duration} ms, {len(animated):,} bytes; original compressed images preserved.")


if __name__ == "__main__":
    main()
