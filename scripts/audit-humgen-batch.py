"""Read-only inspection of an existing HumGen v2 batch; writes an audit report only.

Receipt integrity and dHash screening do not certify visual quality or identity.
This tool never admits assets, edits images, or changes the producer's hold list.
"""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image

AGES = [15, 18, 22, 27, 31, 35, 39, 45]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fingerprint(path):
    # Same face region and 128-bit ordering as the existing production screen.
    with Image.open(path) as image:
        face = image.convert("L").crop((int(image.width*.28), int(image.height*.25),
                                        int(image.width*.72), int(image.height*.61)))
        pixels = list(face.resize((9, 9), Image.Resampling.LANCZOS).tobytes())
    value = 0
    for y in range(8):
        for x in range(8):
            value = (value << 1) | int(pixels[y*9+x] > pixels[y*9+x+1])
    for y in range(8):
        for x in range(8):
            value = (value << 1) | int(pixels[y*9+x] > pixels[(y+1)*9+x])
    return value


def audit(source, repo, excluded_pack=None):
    manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    source_hash = digest(source.parent / "source-manifest.json")
    if source_hash != manifest["assets"]:
        raise ValueError("Source asset manifest mismatch")
    existing = []
    catalog_root = repo / "src/data/portraits"
    sources = json.loads((catalog_root / "bundled-packs.json").read_text(encoding="utf-8"))
    for source_pack in sources:
        manifest_path = catalog_root / source_pack["file"]
        pack = json.loads(manifest_path.read_text(encoding="utf-8"))
        if pack["packId"] == excluded_pack:
            continue
        for lineage in pack.get("lineages", []):
            adult = next(asset for asset in lineage["assets"] if asset["age"] == 22)
            path = repo / "public" / adult["path"].lstrip("/")
            existing.append((lineage["lineageId"], fingerprint(path)))
    rows = []
    for complete_path in sorted((source / "renders").glob("*/complete.json")):
        folder = complete_path.parent
        errors = []
        complete = json.loads(complete_path.read_text(encoding="utf-8"))
        recipe = json.loads((folder / "recipe.json").read_text(encoding="utf-8"))
        if complete["recipe"] != recipe or complete["assets"] != manifest["assets"] or sorted(complete["ages"]) != AGES:
            errors.append("completion receipt mismatch")
        if (folder / "held.json").exists():
            errors.append("producer hold exists")
        hashes = []
        total_bytes = 0
        for age in AGES:
            path = folder / f"age-{age}.webp"
            try:
                receipt = json.loads((folder / f"age-{age}.json").read_text(encoding="utf-8"))
                sha = digest(path)
                hashes.append(sha)
                total_bytes += path.stat().st_size
                if (receipt["sha256"] != sha or receipt["bytes"] != path.stat().st_size
                        or receipt["age"] != age or receipt["candidate"] != recipe["index"]
                        or receipt["width"] != 320 or receipt["height"] != 400
                        or receipt["status"] != "encoded"):
                    errors.append(f"age {age}: receipt mismatch")
                with Image.open(path) as image:
                    image.load()
                    if image.size != (320, 400) or image.format != "WEBP":
                        errors.append(f"age {age}: invalid decoded image")
            except (OSError, ValueError, KeyError) as error:
                errors.append(f"age {age}: {error}")
        if len(set(hashes)) != 8:
            errors.append("age images missing or byte-identical")
        row = {"candidate": recipe["index"], "folder": str(folder),
               "preset": recipe["preset"], "bytes": total_bytes, "errors": errors}
        if not errors:
            fp = fingerprint(folder / "age-22.webp")
            nearest = sorted(({"identity": identity, "distance": (fp ^ other).bit_count()}
                              for identity, other in existing), key=lambda item: item["distance"])
            row["nearest"] = nearest[:3]
            row["likenessReviewRequired"] = bool(nearest and nearest[0]["distance"] <= 10)
            existing.append((f"candidate-{recipe['index']}", fp))
        rows.append(row)
    return {"source": str(source), "manifestSha256": digest(source / "manifest.json"),
            "scope": "Receipt and decoding audit plus conservative dHash review flags against bundled portraits and earlier candidates. Not visual approval; flags do not prove the same identity.",
            "completedPeople": len(rows), "verifiedPeople": sum(not row["errors"] for row in rows),
            "verifiedImages": sum(8 for row in rows if not row["errors"]),
            "likenessReviewPeople": sum(row.get("likenessReviewRequired", False) for row in rows),
            "bytes": sum(row["bytes"] for row in rows), "people": rows}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source, repo, output = args.source.resolve(), args.repo.resolve(), args.output.resolve()
    if output.is_relative_to(source) or output.exists():
        raise ValueError("Use a new audit output outside the source batch")
    report = audit(source, repo)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({key: value for key, value in report.items() if key != "people"}, indent=2))
    if report["verifiedPeople"] != report["completedPeople"]:
        raise SystemExit(1)
