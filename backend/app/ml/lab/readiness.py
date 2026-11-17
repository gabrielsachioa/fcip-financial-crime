"""Descriptive data checks before an ML experiment, without fitting a model.

Use a development source, not an untouched final dataset. Transaction validation
uses the upload normalizer. Label/channel/category diagnostics inspect TRAIN
only; later periods disclose row/time metadata, never their reference outcomes.
An absent negative mapping is uncertainty, not permission to invent negatives.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.ml.behavioral.features import (
    MIN_HISTORY_COUNT,
    MIN_HISTORY_DAYS,
    build_features,
    fit_vocabulary,
)
from app.ml.lab.mapping import (
    FIELDS,
    MISSING_LABEL_VALUES,
    UNRESOLVED_LABEL_VALUES,
    LabDataError,
    map_for_monitoring,
    normalize_label_cells,
)
from app.ml.lab.trainer import LabTrainingError, availability_dates, chronological_split

VERSION = "ml_data_readiness_v1"


def _values(mapping: dict, key: str) -> set[str]:
    values = mapping.get(key) or []
    if not isinstance(values, (list, tuple)):
        raise LabDataError(f"{key} harus berupa daftar nilai label.")
    if any(value is None or (not isinstance(value, str) and pd.isna(value)) for value in values):
        raise LabDataError(f"{key} tidak boleh berisi nilai null.")
    result = {str(value).strip().casefold() for value in values}
    if "" in result or result & MISSING_LABEL_VALUES:
        raise LabDataError(f"{key} tidak boleh berisi nilai kosong/null.")
    return result


def _mapping_snapshot(mapping: dict, fields: dict[str, str | None]) -> dict:
    """Only supported mapping configuration, without source transaction cells."""
    snapshot = {
        "fields": dict(fields),
        "label_column": mapping.get("label_column") or None,
        "category_column": mapping.get("category_column") or None,
        "positive_values": list(mapping.get("positive_values") or []),
        "date_format": mapping.get("date_format") or "iso",
        "default_currency": mapping.get("default_currency") or "XXX",
    }
    if "negative_values" in mapping:
        supplied = mapping["negative_values"]
        snapshot["negative_values"] = list(supplied) if supplied is not None else None
    return snapshot


def _time_summary(frame: pd.DataFrame) -> dict:
    if frame.empty:
        return {"rows": 0, "date_from": None, "date_to": None,
                "availability_from": None, "availability_to": None}
    dates = pd.to_datetime(frame.transaction_date, utc=True)
    available = availability_dates(frame)
    return {"rows": len(frame), "date_from": dates.min().isoformat(), "date_to": dates.max().isoformat(),
            "availability_from": available.min().isoformat(), "availability_to": available.max().isoformat()}


def _history_summary(frame: pd.DataFrame) -> list[dict]:
    result = []
    for currency, group in frame.groupby("currency", sort=True):
        # Includes unlabelled transactions as observed history; their labels
        # never enter a vocabulary or a feature. Currencies stay separate.
        features = build_features(group, "FRAUD", fit_vocabulary(group))
        has_baseline = features.NO_BASELINE.eq(0)
        result.append({
            "currency": str(currency), "rows": len(group),
            "accounts": int(group.account_number.nunique()),
            "baseline_available_rows": int(has_baseline.sum()),
            "baseline_unavailable_rows": int((~has_baseline).sum()),
            "prior_mean_available_rows": int(features.AMOUNT_OVER_PRIOR_MEAN.notna().sum()),
            "day_only_rows": int(group.timestamp_precision.eq("day").sum()),
            "source_timezone_unknown_rows": int((~group.source_timezone_known).sum()),
        })
    return result


def audit_readiness(raw: pd.DataFrame, mapping: dict, *, train_share: float) -> dict:
    """Describe a mapped development source without changing it or choosing a model.

    Unlike apply_mapping, this audit retains blank/unknown-label transactions
    for history diagnostics and never converts an unconfirmed value to zero.
    Its split therefore describes all accepted observations; it does not claim
    to be the exact training split after training's exclusions.
    """
    if not isinstance(mapping, dict):
        raise LabDataError("Pemetaan harus berupa objek JSON.")
    supplied_fields = mapping.get("fields") or {}
    if not isinstance(supplied_fields, dict) or any(not isinstance(key, str) or
                                                   (value is not None and not isinstance(value, str))
                                                   for key, value in supplied_fields.items()):
        raise LabDataError("Field transaksi harus berupa objek nama field ke nama kolom.")
    # The Lab UI sends null for optional unmapped columns. Its normalizer
    # treats null/empty selections like omitted keys; diagnostics must agree.
    fields = {key: value for key, value in supplied_fields.items() if value}
    for key in ("label_column", "category_column", "date_format", "default_currency"):
        if mapping.get(key) is not None and not isinstance(mapping[key], str):
            raise LabDataError(f"{key} harus berupa teks.")
    monitored = map_for_monitoring(raw, mapping)
    frame = monitored.frame
    label_column = mapping.get("label_column") or None
    category_column = mapping.get("category_column") or None
    for column in (label_column, category_column):
        if column and column not in raw.columns:
            raise LabDataError(f"Kolom tidak ada di file: {column}")
    mapped_columns = set((mapping.get("fields") or {}).values())
    if label_column in mapped_columns or (category_column and category_column in mapped_columns):
        raise LabDataError("Kolom label/kategori tidak boleh menjadi field transaksi.")
    if label_column and label_column == category_column:
        raise LabDataError("Kolom label dan kategori harus berbeda.")
    positive = _values(mapping, "positive_values")
    negative = _values(mapping, "negative_values")
    if positive & negative:
        raise LabDataError("Nilai label positif dan negatif saling tumpang tindih.")

    ref_column = fields.get("transaction_ref")
    references = raw[ref_column].astype("string").fillna("").str.strip() if ref_column else None
    duplicate_mask = (references.ne("") & references.duplicated(False)) if references is not None else None
    duplicate_rows = int(duplicate_mask.sum()) if duplicate_mask is not None else None
    duplicate_values = int(references[duplicate_mask].nunique()) if duplicate_mask is not None else None
    checks = []
    if not negative:
        checks.append("NEGATIVE_VALUES_NOT_EXPLICIT")
    if not label_column:
        checks.append("LABEL_COLUMN_NOT_MAPPED")
    if not positive:
        checks.append("POSITIVE_VALUES_NOT_EXPLICIT")
    if negative & UNRESOLVED_LABEL_VALUES:
        checks.append("UNRESOLVED_STATUS_CONFIGURED_AS_NEGATIVE_LABEL")
    if monitored.report["quarantined"]:
        checks.append("TRANSACTION_ROWS_QUARANTINED")
    if duplicate_values:
        checks.append("DUPLICATE_TRANSACTION_REFERENCE_VALUES")
    if frame.currency.nunique() > 1:
        checks.append("MULTIPLE_CURRENCY_UNITS")

    report = {
        "version": VERSION,
        "purpose": "Development-data diagnostics only; not model quality or a production acceptance decision.",
        "model_fitted": False, "predictions_computed": False,
        "reference_label_scope": "TRAIN only; validation and TEST outcomes are withheld.",
        "input": {
            "total_rows": len(raw), "accepted_transactions": len(frame),
            "quarantined_transactions": monitored.report["quarantined"],
            "quarantine_reasons": monitored.report["quarantine_reasons"],
            "duplicate_reference_rows": duplicate_rows,
            "duplicate_reference_rows_definition": "All rows sharing a nonempty reference, including its first occurrence.",
            "duplicate_reference_values": duplicate_values,
            "generated_reference_ids": ref_column is None,
            "currencies": monitored.report["currencies"],
        },
        "mapping": {
            "snapshot": _mapping_snapshot(mapping, supplied_fields),
            "snapshot_scope": "Supported Lab mapping configuration only; no transaction cells or arbitrary source metadata.",
            "positive_values": sorted(positive), "negative_values": sorted(negative),
            "negative_mapping_explicit": bool(negative),
            "unmapped_transaction_fields": [field["key"] for field in FIELDS if field["key"] not in fields],
            "notes": [note for note in monitored.report["notes"] if "diabaikan" not in note],
        },
        "chronology": {"requested_train_share": train_share,
                       "split_population": "All accepted transactions, including unlabelled history; not a training run."},
        "train": None, "review_items": checks,
        "review_item_policy": "Descriptive issues for review; no automatic model acceptance, training prohibition, or scoring suppression.",
        "limitations": [
            "Explicit labels still require reviewer provenance and an agreed target definition.",
            "A channel with one observed label class is a shortcut risk to review, not evidence of fraud.",
            "No diagnostic proves fraud intent, money laundering, or real-bank accuracy.",
            "Do not pass an untouched final source; these checks are for development data.",
        ],
    }
    try:
        partitions = chronological_split(frame, train_share)
    except LabTrainingError as exc:
        report["chronology"]["error"] = str(exc)
        checks.append("CHRONOLOGICAL_SPLIT_UNAVAILABLE")
        return report
    report["chronology"]["partitions"] = {
        name: {**_time_summary(frame.loc[partitions == name]), "reference_labels_disclosed": name == "train"}
        for name in ("train", "validation", "test")
    }
    train = frame.loc[partitions == "train"].reset_index(drop=True)
    positions = train.source_ordinal.to_numpy(dtype=np.int64) - 1
    labels = (normalize_label_cells(raw[label_column]).to_numpy()[positions]
              if label_column else np.full(len(train), "", dtype=object))
    # An explicitly chosen REVIEW positive can represent the review-worthy
    # target. An unchosen or negative review status never means normal.
    unresolved = np.isin(labels, list(UNRESOLVED_LABEL_VALUES - positive))
    state = np.where(labels == "", "blank", np.where(unresolved, "unresolved",
                     np.where(np.isin(labels, list(positive)), "positive",
                     np.where(np.isin(labels, list(negative)), "negative", "unconfirmed_negative"))))
    label_counts = {key: int((state == key).sum())
                    for key in ("positive", "negative", "blank", "unresolved", "unconfirmed_negative")}
    if label_counts["unresolved"]:
        checks.append("TRAIN_UNRESOLVED_LABELS")
    if label_counts["unconfirmed_negative"]:
        checks.append("TRAIN_UNCONFIRMED_LABEL_VALUES")
    if label_counts["blank"]:
        checks.append("TRAIN_UNLABELLED_OBSERVATIONS")
    contingency = pd.DataFrame({"channel": train.channel.fillna("UNKNOWN"), "state": state})
    channels = []
    for channel, group in contingency.groupby("channel", sort=True):
        positives = int(group.state.eq("positive").sum())
        negatives = int(group.state.eq("negative").sum())
        channels.append({"channel": str(channel), "rows": len(group), "positive": positives, "negative": negatives,
                         "unconfirmed_or_unlabelled": len(group) - positives - negatives,
                         "only_one_mapped_class_observed": (positives > 0) != (negatives > 0)})
    categories = None
    if category_column:
        values = raw[category_column].astype("string").fillna("").str.strip().to_numpy()[positions]
        categories = [{"category": str(category), "positive": int(((values == category) & (state == "positive")).sum()),
                       "negative": int(((values == category) & (state == "negative")).sum())}
                      for category in sorted(set(values))]
    history = _history_summary(train)
    if any(group["baseline_unavailable_rows"] > 0 for group in history):
        checks.append("TRAIN_HISTORY_BASELINE_UNAVAILABLE")
    if any(channel["only_one_mapped_class_observed"] for channel in channels):
        checks.append("TRAIN_CHANNEL_SINGLE_LABEL_CLASS")
    report["train"] = {
        "rows": len(train), "label_counts": label_counts,
        "unconfirmed_label_values": sorted(set(labels[state == "unconfirmed_negative"])),
        "history_policy": {"min_prior_observations": MIN_HISTORY_COUNT, "min_observed_days": MIN_HISTORY_DAYS,
                           "source": "Existing behavioral_v1 feature gate; descriptive only, no new scoring restriction."},
        "history_by_currency": history,
        "channel_label_support": channels, "category_label_support": categories,
    }
    return report
