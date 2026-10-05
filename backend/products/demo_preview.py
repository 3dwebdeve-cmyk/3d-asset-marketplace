"""Small, self-contained GLB previews for the staging demo products.

The E2E triangle fixture is useful for smoke tests but is not product artwork.
These meshes intentionally contain no external textures or URLs.
"""

from __future__ import annotations

import json
import math
import struct
from pathlib import Path


class _GlbScene:
    def __init__(self) -> None:
        self.binary = bytearray()
        self.views: list[dict] = []
        self.accessors: list[dict] = []
        self.meshes: list[dict] = []
        self.nodes: list[dict] = []
        self.materials: list[dict] = []
        self.material_ids: dict[tuple[float, float, float], int] = {}

    def _view(self, data: bytes, target: int) -> int:
        while len(self.binary) % 4:
            self.binary.append(0)
        offset = len(self.binary)
        self.binary.extend(data)
        self.views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data), "target": target})
        return len(self.views) - 1

    def _accessor(self, view: int, count: int, component: int, kind: str, values: list[float] | None = None) -> int:
        accessor = {"bufferView": view, "componentType": component, "count": count, "type": kind}
        if values is not None:
            dimensions = 3 if kind == "VEC3" else 1
            accessor["min"] = [min(values[i::dimensions]) for i in range(dimensions)]
            accessor["max"] = [max(values[i::dimensions]) for i in range(dimensions)]
        self.accessors.append(accessor)
        return len(self.accessors) - 1

    def add(self, positions: list[float], normals: list[float], indices: list[int], color: tuple[float, float, float]) -> None:
        if color not in self.material_ids:
            self.material_ids[color] = len(self.materials)
            self.materials.append({
                "pbrMetallicRoughness": {
                    "baseColorFactor": [*color, 1],
                    "metallicFactor": 0,
                    "roughnessFactor": 0.82,
                },
                "doubleSided": True,
            })
        position_view = self._view(struct.pack(f"<{len(positions)}f", *positions), 34962)
        normal_view = self._view(struct.pack(f"<{len(normals)}f", *normals), 34962)
        index_view = self._view(struct.pack(f"<{len(indices)}H", *indices), 34963)
        mesh_index = len(self.meshes)
        self.meshes.append({"primitives": [{
            "attributes": {
                "POSITION": self._accessor(position_view, len(positions) // 3, 5126, "VEC3", positions),
                "NORMAL": self._accessor(normal_view, len(normals) // 3, 5126, "VEC3"),
            },
            "indices": self._accessor(index_view, len(indices), 5123, "SCALAR"),
            "material": self.material_ids[color],
        }]})
        self.nodes.append({"mesh": mesh_index})

    def box(self, center: tuple[float, float, float], size: tuple[float, float, float], color: tuple[float, float, float]) -> None:
        cx, cy, cz = center
        sx, sy, sz = (value / 2 for value in size)
        corners = [
            (cx - sx, cy - sy, cz - sz), (cx + sx, cy - sy, cz - sz),
            (cx + sx, cy + sy, cz - sz), (cx - sx, cy + sy, cz - sz),
            (cx - sx, cy - sy, cz + sz), (cx + sx, cy - sy, cz + sz),
            (cx + sx, cy + sy, cz + sz), (cx - sx, cy + sy, cz + sz),
        ]
        faces = [
            ((0, 3, 2, 1), (0, 0, -1)), ((4, 5, 6, 7), (0, 0, 1)),
            ((0, 4, 7, 3), (-1, 0, 0)), ((1, 2, 6, 5), (1, 0, 0)),
            ((0, 1, 5, 4), (0, -1, 0)), ((3, 7, 6, 2), (0, 1, 0)),
        ]
        positions: list[float] = []
        normals: list[float] = []
        indices: list[int] = []
        for face, normal in faces:
            start = len(positions) // 3
            for corner in face:
                positions.extend(corners[corner])
                normals.extend(normal)
            indices.extend((start, start + 1, start + 2, start, start + 2, start + 3))
        self.add(positions, normals, indices, color)

    def cylinder(self, bottom: float, top: float, height: float, center: tuple[float, float, float], color: tuple[float, float, float], segments: int = 16) -> None:
        cx, cy, cz = center
        positions: list[float] = []
        normals: list[float] = []
        indices: list[int] = []
        slope = (bottom - top) / height
        for i in range(segments + 1):
            angle = 2 * math.pi * i / segments
            x, z = math.cos(angle), math.sin(angle)
            for radius, y in ((bottom, cy - height / 2), (top, cy + height / 2)):
                positions.extend((cx + x * radius, y, cz + z * radius))
                length = math.hypot(1, slope)
                normals.extend((x / length, slope / length, z / length))
            if i < segments:
                start = i * 2
                indices.extend((start, start + 1, start + 3, start, start + 3, start + 2))
        for radius, y, direction in ((bottom, cy - height / 2, -1), (top, cy + height / 2, 1)):
            start = len(positions) // 3
            positions.extend((cx, y, cz))
            normals.extend((0, direction, 0))
            for i in range(segments + 1):
                angle = 2 * math.pi * i / segments
                positions.extend((cx + math.cos(angle) * radius, y, cz + math.sin(angle) * radius))
                normals.extend((0, direction, 0))
                if i < segments:
                    if direction > 0:
                        indices.extend((start, start + i + 1, start + i + 2))
                    else:
                        indices.extend((start, start + i + 2, start + i + 1))
        self.add(positions, normals, indices, color)

    def bytes(self) -> bytes:
        document = {
            "asset": {"version": "2.0", "generator": "demo_preview.py"},
            "scene": 0,
            "scenes": [{"nodes": list(range(len(self.nodes)))}],
            "nodes": self.nodes,
            "meshes": self.meshes,
            "materials": self.materials,
            "accessors": self.accessors,
            "bufferViews": self.views,
            "buffers": [{"byteLength": len(self.binary)}],
        }
        json_chunk = json.dumps(document, separators=(",", ":")).encode().ljust(
            (len(json.dumps(document, separators=(",", ":")).encode()) + 3) & ~3, b" "
        )
        bin_chunk = bytes(self.binary).ljust((len(self.binary) + 3) & ~3, b"\0")
        total = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
        return (struct.pack("<III", 0x46546C67, 2, total)
                + struct.pack("<I4s", len(json_chunk), b"JSON") + json_chunk
                + struct.pack("<I4s", len(bin_chunk), b"BIN\0") + bin_chunk)


def build_demo_preview(slug: str) -> bytes:
    scene = _GlbScene()
    if slug == "demo-plant-pot":
        scene.cylinder(0.46, 0.58, 0.78, (0, -0.36, 0), (0.67, 0.32, 0.20))
        scene.cylinder(0.60, 0.60, 0.10, (0, 0.07, 0), (0.75, 0.40, 0.27))
        scene.cylinder(0.53, 0.53, 0.015, (0, 0.13, 0), (0.19, 0.16, 0.12))
        for x, z, height in ((0, 0, 0.88), (-0.19, 0.10, 0.72), (0.20, -0.08, 0.78)):
            scene.cylinder(0.028, 0.018, height, (x, 0.13 + height / 2, z), (0.17, 0.38, 0.14), 8)
            scene.box((x - 0.14, 0.13 + height * 0.72, z), (0.31, 0.10, 0.16), (0.22, 0.49, 0.19))
            scene.box((x + 0.14, 0.13 + height * 0.85, z), (0.31, 0.10, 0.16), (0.28, 0.56, 0.22))
    elif slug == "demo-desk-lamp":
        scene.cylinder(0.47, 0.39, 0.10, (0, -0.85, 0), (0.26, 0.29, 0.34))
        scene.cylinder(0.045, 0.045, 1.20, (0, -0.20, 0), (0.36, 0.39, 0.43), 12)
        scene.cylinder(0.18, 0.58, 0.62, (0, 0.66, 0), (0.86, 0.74, 0.54))
        scene.cylinder(0.55, 0.55, 0.035, (0, 0.34, 0), (0.93, 0.86, 0.67))
    elif slug == "demo-oak-chair":
        wood = (0.49, 0.27, 0.13)
        scene.box((0, -0.08, 0), (1.35, 0.16, 1.18), wood)
        scene.box((0, 0.59, -0.52), (1.35, 1.25, 0.14), (0.56, 0.32, 0.16))
        for x in (-0.52, 0.52):
            for z in (-0.43, 0.43):
                scene.box((x, -0.64, z), (0.16, 1.05, 0.16), wood)
    else:
        raise ValueError(f"Unknown demo preview: {slug}")
    return scene.bytes()


if __name__ == "__main__":
    import sys

    output_dir = Path(sys.argv[1])
    output_dir.mkdir(parents=True, exist_ok=True)
    for name in ("demo-plant-pot", "demo-desk-lamp", "demo-oak-chair"):
        (output_dir / f"{name}.glb").write_bytes(build_demo_preview(name))
