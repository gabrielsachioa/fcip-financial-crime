"""Validation-only comparison on an existing, checksum-pinned labelled source.

No DB imports, source writes, TEST scoring or promotion. An already exposed
final stays exposed; this command does not claim to create independent evidence.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path

import numpy as np

from app.ml.behavioral.features import build_features
from app.ml.lab.features import FEATURE_GROUPS
from app.ml.lab.mapping import apply_mapping, read_table_bytes
from app.ml.lab.trainer import SEED, chronological_split, point, ranking, score, train_run

VERSION = "transaction_context_comparison_v1"
MODEL_KEYS = ["logistic_regression", "lightgbm", "isolation_forest"]
BASE_GROUPS = [g["key"] for g in FEATURE_GROUPS if g["default"]]
VARIANTS = {
    "baseline": BASE_GROUPS,
    "context": [*BASE_GROUPS, "urutan", "tujuan", "arus"],
    "baseline_without_channel_frequency": [g for g in BASE_GROUPS if g != "kanal"],
    "context_without_channel_frequency": [g for g in BASE_GROUPS if g != "kanal"] + ["urutan", "tujuan", "arus"],
}
BACKEND = Path(__file__).resolve().parents[2]
CODE_PATHS = [
    "app/scripts/compare_transaction_context.py", "app/ml/behavioral/transaction_context.py",
    "app/ml/behavioral/features.py", "app/ml/behavioral/standardize.py", "app/ml/behavioral/model.py",
    "app/ml/lab/features.py", "app/ml/lab/mapping.py", "app/ml/lab/trainer.py", "app/services/tabular.py",
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value) -> None:
    with path.open("x") as stream:
        json.dump(value, stream, indent=2, sort_keys=True, allow_nan=False)
        stream.write("\n")


def pattern_counts(scores, y, categories, threshold):
    return {str(c): {"positives": int(((y == 1) & (categories == c)).sum()),
                     "caught": int(((y == 1) & (categories == c) & (scores >= threshold)).sum())}
            for c in sorted(set(categories[y == 1]))}


def matched_point(scores, y, categories, reference, reference_patterns):
    """Validation diagnostic: retain overall/per-pattern catches, minimise FP.

    Ties prefer more positives, then the higher threshold. This never tunes a
    final result or replaces the native Lab's recorded selection protocol.
    """
    choices = []
    for threshold in np.unique(np.r_[scores, 1.]):
        result = point(scores, y, threshold)
        if result["tp"] < reference["tp"]:
            continue
        patterns = pattern_counts(scores, y, categories, threshold)
        if any(patterns.get(c, {}).get("caught", 0) < r["caught"] for c, r in reference_patterns.items()):
            continue
        choices.append((result, patterns))
    if not choices:
        raise ValueError("No comparable validation operating point")
    result, patterns = min(choices, key=lambda p: (p[0]["fp"], -p[0]["tp"], -p[0]["threshold"]))
    return {**result, "patterns": patterns,
            "no_more_false_positives": result["fp"] <= reference["fp"],
            "strict_improvement": (result["fp"] < reference["fp"] or result["tp"] > reference["tp"])}


def run(data: Path, mapping_path: Path, expected_sha256: str, out: Path, train_share: float) -> dict:
    if not .5 <= train_share <= .8:
        raise ValueError("Training share must be between 0.5 and 0.8")
    if sha256(data) != expected_sha256:
        raise ValueError("Data differs from the pinned source checksum")
    if out.exists():
        raise FileExistsError("Refusing to overwrite an experiment directory")
    mapping_bytes = mapping_path.read_bytes()
    mapping = json.loads(mapping_bytes)
    if not mapping.get("negative_values"):
        raise ValueError("The comparison requires explicit negative label values")
    raw, _ = read_table_bytes(data.read_bytes())
    mapped = apply_mapping(raw, mapping)
    if not mapped.report["ready"]:
        raise ValueError("Source does not meet the existing Lab class-support gate")
    if not mapping.get("fields", {}).get("direction"):
        raise ValueError("Flow features require an explicitly mapped direction")
    parts = chronological_split(mapped.frame, train_share)
    val = parts == "validation"
    y = mapped.labels[val]
    categories = (mapped.categories[val].fillna("").to_numpy()
                  if mapped.categories is not None else np.full(int(val.sum()), "(unavailable)"))
    code = {name: sha256(BACKEND / name) for name in CODE_PATHS}
    protocol = {
        "version": VERSION, "started_at_utc": datetime.now(timezone.utc).isoformat(),
        "input_sha256": expected_sha256, "mapping_sha256": hashlib.sha256(mapping_bytes).hexdigest(),
        "code_sha256": code, "seed": SEED, "train_share": train_share,
        "variants": VARIANTS, "model_keys": MODEL_KEYS,
        "selection": "Native highest validation AP per variant; native max-F1 validation threshold.",
        "comparison": "Also report minimum-FP validation threshold retaining reference total/per-pattern catches; ties prefer TP then threshold.",
        "split_rows": {name: int((parts == name).sum()) for name in ("train", "validation", "test")},
        "test_scores_computed": False, "test_outcomes_disclosed": False,
        "independent_final_claimed": False, "registered_or_activated": False,
        "dependencies": {name: importlib.metadata.version(name) for name in ("numpy", "pandas", "scikit-learn", "lightgbm")},
    }
    out.mkdir(parents=True)
    write_json(out / "protocol.json", protocol)
    (out / "mapping.json").write_bytes(mapping_bytes)
    results, selected = {}, {}
    for name, groups in VARIANTS.items():
        outcome = train_run(mapped.frame, mapped.labels, mapped.categories, feature_groups=groups,
                            model_keys=MODEL_KEYS, train_share=train_share)
        if (any(model.test_curve for model in outcome.models)
                or set(outcome.results["split"]["test"]) - {"rows", "date_from", "date_to", "availability_from", "availability_to"}):
            raise ValueError("Comparison must not disclose or score final outcomes")
        vocabulary = outcome.results["features"]["vocabulary"]
        built = build_features(mapped.frame, "FRAUD", vocabulary).set_index("transaction_ref")
        matrix = built.loc[mapped.frame.transaction_ref].reset_index(drop=True)
        for model in outcome.models:
            (out / f"{name}_{model.key}.txt").write_text(model.model_text)
        model = next(m for m in outcome.models if m.key == outcome.results["best_model"])
        scores = score(model.key, model.model_text, matrix.loc[val, model.features])
        if scores.shape != y.shape or not np.isfinite(scores).all():
            raise ValueError("Validation scores must be finite and aligned")
        threshold = model.thresholds[model.default_index]
        result = {**point(scores, y, threshold), **ranking(scores, y),
                  "patterns": pattern_counts(scores, y, categories, threshold),
                  "model_key": model.key, "features": model.features, "unusable_features": outcome.results["features"]["unusable"]}
        native = next(s for s in outcome.results["models"] if s["key"] == model.key)
        if result["tp"] != native["validation_curve"][model.default_index]["tp"] or result["fp"] != native["validation_curve"][model.default_index]["fp"]:
            raise ValueError("Saved model validation replay differs from training")
        write_json(out / f"{name}_training.json", outcome.results)
        results[name] = result
        selected[name] = scores
    comparisons = {}
    for name, reference_name in (("context", "baseline"), ("context_without_channel_frequency", "baseline_without_channel_frequency")):
        reference = results[reference_name]
        comparisons[name] = matched_point(selected[name], y, categories, reference, reference["patterns"])
    if sha256(data) != expected_sha256 or mapping_path.read_bytes() != mapping_bytes or any(sha256(BACKEND / name) != digest for name, digest in code.items()):
        raise ValueError("Inputs/code changed during comparison")
    report = {
        "protocol": protocol, "completed_at_utc": datetime.now(timezone.utc).isoformat(),
        "validation_rows": int(val.sum()), "validation_positives": int(y.sum()),
        "results": results, "matched_validation_comparisons": comparisons,
        "source_unchanged": True, "state": "OFFLINE_DRAFT",
        "limitations": [
            "Existing synthetic client data and supplied review key; not adjudicated financial crime or bank validation.",
            "Small correlated scenario/account samples; no independent-episode confidence claim.",
            "This is development validation, not a fresh independent final; existing final exposure is not undone.",
            "Only validation-supported patterns are assessed; absent patterns remain unassessed.",
            "Channel-frequency ablation does not remove every potential recipe shortcut, including timing or channel-diversity shortcuts.",
            "Optional local context is not multi-hop graph reconstruction, ownership evidence, balance reconstruction or calibrated probability.",
            "Native max-F1 and matched-recall points are validation diagnostics, not operational acceptance tolerances.",
        ],
        "artifact_sha256": {p.name: sha256(p) for p in sorted(out.iterdir()) if p.is_file()},
    }
    write_json(out / "results.json", report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--mapping", type=Path, required=True)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--train-share", type=float, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    report = run(args.data, args.mapping, args.expected_sha256, args.out, args.train_share)
    print(json.dumps({"state": report["state"], "validation_rows": report["validation_rows"],
                      "test_scores_computed": False, "output": str(args.out / "results.json")}))


if __name__ == "__main__":
    main()
