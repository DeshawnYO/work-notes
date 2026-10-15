"""Convert the approved dog/duck artwork to Windows icon resources.

Requires Pillow only when regenerating brand assets, not at application runtime.
The approved circular artwork is preserved; a standard circular alpha mask and padding
are applied during format conversion. No application/data modules are imported.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import shutil
import struct

from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ICO_SIZES = (16, 20, 24, 32, 40, 48, 64, 96, 128, 256)
PNG_SIZES = tuple(sorted(set(ICO_SIZES + (192, 512, 1024))))


def resize_rgba(image: Image.Image, size: int) -> Image.Image:
    # Premultiplied alpha avoids dark/white fringes when Windows scales the tile.
    resized = image.convert("RGBa").resize(
        (size, size), Image.Resampling.LANCZOS
    ).convert("RGBA")
    # Lanczos can leave alpha=1 ringing in otherwise transparent tiny corners.
    resized.putalpha(resized.getchannel("A").point(lambda value: 0 if value <= 1 else value))
    return resized


def make_master(source: Path) -> Image.Image:
    with Image.open(source) as artwork:
        artwork.load()
        if artwork.width != artwork.height or artwork.width < 1024:
            raise ValueError("Approved artwork must be square and at least 1024 px.")
        artwork = artwork.convert("RGBA")
    # The circular edit has its center at (50%, 49.5%) of the source canvas.
    # Crop slightly inside the generated disk to remove edge spill, without
    # changing the dog, duck or green background. No white tile is retained.
    side = artwork.width
    diameter = round(side * 0.90)
    left = round((side - diameter) / 2)
    top = round(side * 0.495 - diameter / 2)
    artwork = artwork.crop((left, top, left + diameter, top + diameter))
    # Construct at 4x for a deterministic, antialiased circular alpha boundary.
    scale = 4
    side = artwork.width
    mask = Image.new("L", (side * scale, side * scale), 0)
    ImageDraw.Draw(mask).ellipse(
        (0, 0, side * scale - 1, side * scale - 1),
        fill=255,
    )
    mask = mask.resize((side, side), Image.Resampling.LANCZOS)
    artwork.putalpha(ImageChops.multiply(artwork.getchannel("A"), mask))
    master = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    # Leave 3.125% transparent safe area on every side for desktop/taskbar use.
    master.alpha_composite(resize_rgba(artwork, 960), (32, 32))
    return master


def write_ico(master: Image.Image, target: Path) -> None:
    entries = []
    for size in ICO_SIZES:
        frame = resize_rgba(master, size)
        if size == 256:
            buffer = io.BytesIO()
            frame.save(buffer, format="PNG", optimize=True)
            payload = buffer.getvalue()
        else:
            buffer = io.BytesIO()
            frame.save(buffer, format="ICO", sizes=[(size, size)], bitmap_format="bmp")
            encoded = buffer.getvalue()
            length, offset = struct.unpack_from("<II", encoded, 14)
            payload = encoded[offset:offset + length]
        entries.append((size, payload))
    offset = 6 + 16 * len(entries)
    directory = bytearray(struct.pack("<HHH", 0, 1, len(entries)))
    for size, payload in entries:
        dimension = 0 if size == 256 else size
        directory.extend(struct.pack(
            "<BBBBHHII", dimension, dimension, 0, 0, 1, 32, len(payload), offset
        ))
        offset += len(payload)
    target.write_bytes(bytes(directory) + b"".join(p for _, p in entries))


def verify_ico(target: Path) -> list[dict]:
    encoded = target.read_bytes()
    if struct.unpack_from("<HHH", encoded) != (0, 1, len(ICO_SIZES)):
        raise ValueError("Unexpected ICO header.")
    rows = []
    with Image.open(target) as icon:
        if icon.ico.sizes() != {(s, s) for s in ICO_SIZES}:
            raise ValueError("ICO size set differs from expected sizes.")
        for i, size in enumerate(ICO_SIZES):
            width, height, _, _, planes, bpp, length, offset = struct.unpack_from(
                "<BBBBHHII", encoded, 6 + 16 * i
            )
            if (width or 256, height or 256, planes, bpp) != (size, size, 1, 32):
                raise ValueError("Invalid ICO directory entry.")
            if offset + length > len(encoded):
                raise ValueError("ICO payload outside file.")
            frame = icon.ico.getimage((size, size)).convert("RGBA")
            if frame.getchannel("A").getextrema() != (0, 255):
                raise ValueError("Missing transparent or opaque pixels.")
            if any(frame.getpixel(p)[3] for p in (
                (0, 0), (size-1, 0), (0, size-1), (size-1, size-1)
            )):
                raise ValueError("Corner is not fully transparent.")
            rows.append({"size": size, "bits_per_pixel": bpp,
                         "encoding": "PNG" if size == 256 else "DIB",
                         "alpha_verified": True})
    return rows


def write_preview(master: Image.Image, target: Path) -> None:
    preview = Image.new("RGB", (1500, 940), "#e8e8e5")
    draw = ImageDraw.Draw(preview)
    font = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 21)
    title = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 30)
    draw.text((34, 20), "DOG + DUCK / WINDOWS ICON", fill="#292923", font=title)
    draw.text((34, 64), "Actual pixel sizes / RGBA / light and dark surfaces", fill="#55554f", font=font)
    for row, background in enumerate(("#fafaf8", "#242424")):
        y = 118 + row * 326
        draw.rounded_rectangle((20, y, 1480, y + 312), 12, fill=background)
        color = "#55554f" if row == 0 else "#ddddda"
        x = 44
        for size in ICO_SIZES:
            # All icons here are shown at their true native dimensions.
            tile = resize_rgba(master, size)
            width = max(size + 22, 80)
            icon_y = y + 140 - size // 2
            preview.paste(tile, (x + (width-size)//2, icon_y), tile)
            draw.text((x + width//2, y + 288), str(size), fill=color, font=font, anchor="mm")
            x += width + 12
    for i, background in enumerate(("#fafaf8", "#242424")):
        tile = Image.new("RGBA", (128, 128), background)
        tile.alpha_composite(resize_rgba(master, 128))
        preview.paste(tile.convert("RGB"), (40 + 146*i, 790))
    draw.text((355, 822), "Circular green portrait / transparent outside / no white frame.", fill="#44443f", font=font)
    draw.text((355, 858), "ICO: 16 / 20 / 24 / 32 / 40 / 48 / 64 / 96 / 128 / 256", fill="#44443f", font=font)
    preview.save(target)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "assets/brand/sources/dog-duck-circle-source.png")
    parser.add_argument("--output", type=Path, required=True,
                        help="A new output folder; existing output is never overwritten.")
    parser.add_argument("--sync-source", action="store_true",
                        help="Update source brand files and the served app-icon.png.")
    args = parser.parse_args()
    source = args.source.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    master = make_master(source)
    master.save(output / "work-notes.png", optimize=True)
    write_ico(master, output / "work-notes.ico")
    rows = verify_ico(output / "work-notes.ico")
    png_dir = output / "png"
    png_dir.mkdir()
    for size in PNG_SIZES:
        resize_rgba(master, size).save(png_dir / f"work-notes-{size}.png", optimize=True)
    write_preview(master, output / "icon-preview.png")
    if args.sync_source:
        shutil.copy2(output / "work-notes.ico", ROOT / "assets/brand/work-notes.ico")
        shutil.copy2(output / "work-notes.png", ROOT / "assets/brand/work-notes.png")
        shutil.copy2(output / "png/work-notes-128.png", ROOT / "static/app-icon.png")
    report = {
        "approved_source": str(source.relative_to(ROOT)) if source.is_relative_to(ROOT) else str(source),
        "approved_source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "master_size": [1024, 1024], "mode": "RGBA", "shape": "circle",
        "padding_pixels": 32,
        "ico_frames": rows, "source_resources_updated": args.sync_source,
        "installer_rebuilt": False, "installed_application_updated": False,
        "files": {str(p.relative_to(output)).replace("\\", "/"): {
            "bytes": p.stat().st_size,
            "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
        } for p in sorted(output.rglob("*")) if p.is_file()},
    }
    (output / "asset-manifest.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"output": str(output), "ico_sizes": ICO_SIZES,
                      "source_resources_updated": args.sync_source}, ensure_ascii=False))


if __name__ == "__main__":
    main()
