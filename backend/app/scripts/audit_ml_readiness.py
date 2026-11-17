"""Inspect development-source readiness without training or touching the app DB.

Example (from backend/):
  python -m app.scripts.audit_ml_readiness --data source.csv \\
    --mapping mapping.json --train-share 0.7 --out new_readiness.json

The mapping uses the Lab's column format plus optional explicit negative_values.
Use a development source; do not inspect an untouched final dataset with this CLI.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from app.ml.lab.mapping import LabDataError, read_table_bytes
from app.ml.lab.readiness import audit_readiness


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", type=Path, required=True, help="Development CSV/Parquet source; never an untouched final set.")
    parser.add_argument("--mapping", type=Path, required=True, help="Explicit Lab mapping JSON, including negative_values if reviewed.")
    parser.add_argument("--train-share", type=float, required=True, help="Existing chronological TRAIN share (0.5–0.8); no automatic choice.")
    parser.add_argument("--out", type=Path, help="New JSON path; an existing file is never overwritten. Default: stdout.")
    args = parser.parse_args(argv)
    try:
        if args.out and args.out.exists():
            raise FileExistsError(f"Refusing to overwrite existing output: {args.out}")
        data_bytes, mapping_bytes = args.data.read_bytes(), args.mapping.read_bytes()
        mapping = json.loads(mapping_bytes)
        raw, file_format = read_table_bytes(data_bytes)
        result = audit_readiness(raw, mapping, train_share=args.train_share)
        result["source"] = {"file_format": file_format,
                            "data_sha256": hashlib.sha256(data_bytes).hexdigest(),
                            "mapping_sha256": hashlib.sha256(mapping_bytes).hexdigest()}
        encoded = json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
        if args.out:
            with args.out.open("x", encoding="utf-8") as handle:
                handle.write(encoded)
        else:
            sys.stdout.write(encoded)
        return 0
    except (LabDataError, ValueError, OSError) as exc:
        print(f"Readiness audit failed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
