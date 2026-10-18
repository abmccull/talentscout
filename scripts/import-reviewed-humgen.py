"""Copy a reviewed subset of existing v2 WebPs; never modify source renders."""
import argparse
import hashlib
import json
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location("humgen_audit", Path(__file__).with_name("audit-humgen-batch.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
audit, AGES, digest = module.audit, module.AGES, module.digest


def import_pack(source, repo, review_path):
    review = json.loads(review_path.read_text(encoding="utf-8"))
    if review["sourceManifestSha256"] != digest(source / "manifest.json") or review["reviewedAges"] != AGES:
        raise ValueError("Review does not cover this batch and all ages")
    pack_id = review["packId"]
    if not pack_id or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-" for c in pack_id):
        raise ValueError("Invalid pack ID")
    result = audit(source, repo, excluded_pack=pack_id)
    verified = {person["candidate"]: person for person in result["people"]}
    selected = review["approved"]
    if not selected or len({person["candidate"] for person in selected}) != len(selected):
        raise ValueError("Empty or duplicate review selection")
    pack = {"schemaVersion": 1, "packId": pack_id, "artDirectionVersion": "humgen-studio-v1", "reviewed": True, "lineages": []}
    writes = []
    for person in selected:
        row = verified[person["candidate"]]
        if row["errors"] or row["likenessReviewRequired"]:
            raise ValueError("Selected candidate fails integrity or likeness screening")
        folder = Path(row["folder"])
        lineage_id = f"{pack_id}-{person['candidate']:06d}"
        lineage = {"lineageId": lineage_id, "revision": 1, "canonicalFaceSha256": digest(folder / "age-22.webp"),
                   "anchors": person["anchors"], "provenance": "authored-catalog", "assets": []}
        for age in AGES:
            data = (folder / f"age-{age}.webp").read_bytes()
            public_path = f"/images/portraits/{pack_id}/{lineage_id}/age-{age}.webp"
            writes.append((repo / "public" / public_path.lstrip("/"), data))
            lineage["assets"].append({"age": age, "path": public_path, "width": 320, "height": 400,
                                      "sha256": hashlib.sha256(data).hexdigest()})
        pack["lineages"].append(lineage)
    writes.append((repo / "src/data/portraits" / f"{pack_id}.json", (json.dumps(pack, indent=2) + "\n").encode()))
    # Validate every destination before writing; published content is immutable.
    for path, data in writes:
        if path.exists() and path.read_bytes() != data:
            raise ValueError(f"Refusing to overwrite different published bytes: {path}")
    for path, data in writes:
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    print(json.dumps({"pack": pack_id, "people": len(selected), "images": len(selected)*8,
                      "imageBytes": sum(len(data) for path, data in writes if path.suffix == ".webp")}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--review", type=Path, required=True)
    args = parser.parse_args()
    import_pack(args.source.resolve(), args.repo.resolve(), args.review.resolve())
