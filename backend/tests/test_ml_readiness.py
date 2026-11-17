"""Pure checks for descriptive development-data auditing; no model fit or DB."""

import copy
import hashlib
import json

import numpy as np
import pandas as pd
import pytest

from app.ml.lab.mapping import LabDataError
from app.ml.lab.readiness import audit_readiness
from app.scripts.audit_ml_readiness import main


def source(rows=60):
    return pd.DataFrame({
        "ref": [f"TX-{i:03d}" for i in range(rows)],
        "account": ["ACC-A"] * rows,
        "date": pd.date_range("2026-01-01T12:00:00Z", periods=rows, freq="D").astype(str),
        "amount": [str(100_000 + i * 100) for i in range(rows)],
        "direction": ["OUT"] * rows, "channel": ["APP"] * rows,
        "label": ["1" if i % 3 == 0 else "0" for i in range(rows)],
        "category": ["VELOCITY" if i % 3 == 0 else "NORMAL" for i in range(rows)],
    })


def mapping():
    return {"fields": {"transaction_ref": "ref", "account_number": "account", "transaction_date": "date",
                       "amount": "amount", "direction": "direction", "channel": "channel"},
            "label_column": "label", "positive_values": ["1"], "negative_values": ["0"],
            "category_column": "category", "date_format": "iso", "default_currency": "IDR"}


def test_history_retains_unlabelled_transactions_and_never_fits_a_model(monkeypatch):
    import app.ml.lab.trainer as trainer

    def forbidden(*args, **kwargs):
        raise AssertionError("Readiness must not train or score a model")

    monkeypatch.setattr(trainer, "train_run", forbidden)
    monkeypatch.setattr(trainer, "score", forbidden)
    raw = source()
    raw.loc[:29, "label"] = ""
    before = raw.copy(deep=True)
    result = audit_readiness(raw, mapping(), train_share=.7)
    pd.testing.assert_frame_equal(raw, before)
    train = result["train"]
    assert train["label_counts"]["blank"] == 30
    # The first 30 unlabelled observations are still valid earlier history.
    assert train["history_by_currency"][0]["baseline_available_rows"] == 12
    assert train["history_by_currency"][0]["baseline_unavailable_rows"] == 30
    assert "TRAIN_HISTORY_BASELINE_UNAVAILABLE" in result["review_items"]
    assert "scoring suppression" in result["review_item_policy"]
    assert not result["model_fitted"] and not result["predictions_computed"]


def test_final_outcomes_categories_and_channels_do_not_change_training_diagnostics():
    raw = source()
    result = audit_readiness(raw, mapping(), train_share=.7)
    changed = raw.copy()
    # Only rows 51..59 are the later TEST partition for this daily fixture.
    changed.loc[51:, "label"] = "REVIEW"
    changed.loc[51:, "category"] = "FINAL_ONLY_SECRET_CATEGORY"
    changed.loc[51:, "channel"] = "FINAL_ONLY_CHANNEL"
    after = audit_readiness(changed, mapping(), train_share=.7)
    assert result["train"] == after["train"]
    assert result["review_items"] == after["review_items"]
    assert result["chronology"] == after["chronology"]
    assert "FINAL_ONLY" not in json.dumps(after)
    assert not after["chronology"]["partitions"]["test"]["reference_labels_disclosed"]
    assert not after["chronology"]["partitions"]["validation"]["reference_labels_disclosed"]


def test_no_complement_label_is_invented_and_native_missing_is_blank():
    raw = source()
    raw.loc[1, "label"] = "typo-normal"
    raw.loc[2, "label"] = "PENDING"
    raw.loc[3, "label"] = np.nan
    raw.loc[4, "label"] = pd.NA
    config = mapping()
    del config["negative_values"]
    result = audit_readiness(raw, config, train_share=.7)
    counts = result["train"]["label_counts"]
    assert counts["negative"] == 0
    assert counts["blank"] == 2
    assert counts["unresolved"] == 1
    assert "0" in result["train"]["unconfirmed_label_values"]
    assert "typo-normal" in result["train"]["unconfirmed_label_values"]
    assert "nan" not in result["train"]["unconfirmed_label_values"]
    assert "NEGATIVE_VALUES_NOT_EXPLICIT" in result["review_items"]


def test_explicit_review_positive_is_a_possible_review_target_but_pending_never_normal():
    raw = source()
    raw.loc[0, "label"] = " REVIEW "
    raw.loc[1, "label"] = "pending"
    config = mapping()
    config["positive_values"] = ["1", "review"]
    config["negative_values"] = ["0", "pending"]
    result = audit_readiness(raw, config, train_share=.7)
    assert result["train"]["label_counts"]["positive"] == 14
    assert result["train"]["label_counts"]["unresolved"] == 1
    assert "UNRESOLVED_STATUS_CONFIGURED_AS_NEGATIVE_LABEL" in result["review_items"]


def test_channel_shortcut_is_described_without_claiming_it_proves_fraud():
    raw = source()
    raw.loc[raw.label.eq("1"), "channel"] = "AGENT"
    report = audit_readiness(raw, mapping(), train_share=.7)
    channels = {row["channel"]: row for row in report["train"]["channel_label_support"]}
    assert channels["AGENT"]["positive"] == 14
    assert channels["AGENT"]["negative"] == 0
    assert channels["AGENT"]["only_one_mapped_class_observed"]
    assert channels["APP"]["negative"] == 28
    assert "TRAIN_CHANNEL_SINGLE_LABEL_CLASS" in report["review_items"]
    assert "not evidence of fraud" in " ".join(report["limitations"])


def test_mixed_channel_labels_do_not_create_a_single_class_warning():
    report = audit_readiness(source(), mapping(), train_share=.7)
    assert not report["train"]["channel_label_support"][0]["only_one_mapped_class_observed"]
    assert "TRAIN_CHANNEL_SINGLE_LABEL_CLASS" not in report["review_items"]


def test_unlabelled_source_is_diagnostic_without_failure_or_invented_channel_classes():
    raw = source()
    raw["label"] = ""
    report = audit_readiness(raw, mapping(), train_share=.7)
    assert report["train"]["label_counts"]["blank"] == 42
    assert "TRAIN_UNLABELLED_OBSERVATIONS" in report["review_items"]
    assert "TRAIN_CHANNEL_SINGLE_LABEL_CLASS" not in report["review_items"]
    assert not report["model_fitted"]


def test_duplicate_references_and_invalid_dates_are_not_silently_dropped():
    raw = source()
    raw.loc[1, "ref"] = raw.loc[0, "ref"]
    raw.loc[2, "date"] = "2026-99-99"
    report = audit_readiness(raw, mapping(), train_share=.7)
    assert report["input"]["duplicate_reference_rows"] == 2
    assert report["input"]["duplicate_reference_values"] == 1
    assert "DUPLICATE_TRANSACTION_REFERENCE_VALUES" in report["review_items"]
    assert "including its first" in report["input"]["duplicate_reference_rows_definition"]
    assert report["input"]["quarantined_transactions"] == 2
    reasons = " ".join(item["reason"] for item in report["input"]["quarantine_reasons"])
    assert "duplicate transaction_ref" in reasons and "transaction_date" in reasons


def test_currency_histories_are_separate_and_insufficient_time_is_reported():
    raw = source()
    raw["currency"] = ["USD" if i % 2 else "IDR" for i in range(len(raw))]
    config = mapping()
    config["fields"]["currency"] = "currency"
    result = audit_readiness(raw, config, train_share=.7)
    assert "MULTIPLE_CURRENCY_UNITS" in result["review_items"]
    assert len(result["train"]["history_by_currency"]) == 2
    assert all(group["baseline_available_rows"] == 0 for group in result["train"]["history_by_currency"])
    raw["date"] = "2026-01-01"
    insufficient = audit_readiness(raw, config, train_share=.7)
    assert insufficient["train"] is None
    assert "CHRONOLOGICAL_SPLIT_UNAVAILABLE" in insufficient["review_items"]


@pytest.mark.parametrize("value", [None, float("nan"), "", "null"])
def test_invalid_configured_label_values_are_rejected(value):
    config = mapping()
    config["negative_values"] = [value]
    with pytest.raises(LabDataError, match="null|kosong"):
        audit_readiness(source(), config, train_share=.7)


@pytest.mark.parametrize("key,value", [("fields", ["amount"]), ("fields", {"amount": 123}),
                                       ("label_column", ["label"]), ("default_currency", 123)])
def test_malformed_mapping_is_reported_as_a_data_error(key, value):
    config = mapping()
    config[key] = value
    with pytest.raises(LabDataError):
        audit_readiness(source(), config, train_share=.7)


def test_cli_has_input_hashes_and_exclusive_output_without_source_changes(tmp_path, capsys):
    data = tmp_path / "development.csv"
    config = tmp_path / "mapping.json"
    out = tmp_path / "readiness.json"
    source().to_csv(data, index=False)
    config.write_text(json.dumps(mapping()))
    original_data, original_config = data.read_bytes(), config.read_bytes()
    args = ["--data", str(data), "--mapping", str(config), "--train-share", ".7", "--out", str(out)]
    assert main(args) == 0
    report = json.loads(out.read_text())
    assert report["source"]["data_sha256"] == hashlib.sha256(original_data).hexdigest()
    assert report["source"]["mapping_sha256"] == hashlib.sha256(original_config).hexdigest()
    original_out = out.read_bytes()
    assert main(args) == 2
    assert "Refusing to overwrite" in capsys.readouterr().err
    assert out.read_bytes() == original_out
    assert data.read_bytes() == original_data and config.read_bytes() == original_config


def test_audit_mapping_does_not_mutate_user_configuration():
    config = mapping()
    config["untrusted_source_note"] = "Must not be copied into mapping provenance"
    original = copy.deepcopy(config)
    report = audit_readiness(source(), config, train_share=.7)
    assert config == original
    snapshot = report["mapping"]["snapshot"]
    assert snapshot == mapping()
    assert audit_readiness(source(), snapshot, train_share=.7)["train"] == report["train"]
    assert "Must not be copied" not in json.dumps(report)
    config["fields"]["amount"] = "altered-after-audit"
    assert snapshot["fields"]["amount"] == "amount"


def test_mapping_snapshot_retains_absent_negative_contract_and_effective_defaults():
    config = mapping()
    for key in ("negative_values", "date_format", "default_currency"):
        config.pop(key)
    report = audit_readiness(source(), config, train_share=.7)
    snapshot = report["mapping"]["snapshot"]
    assert "negative_values" not in snapshot
    assert snapshot["date_format"] == "iso"
    assert snapshot["default_currency"] == "XXX"
    replay = audit_readiness(source(), snapshot, train_share=.7)
    assert report["train"] == replay["train"]
    assert "NEGATIVE_VALUES_NOT_EXPLICIT" in replay["review_items"]


def test_lab_optional_null_field_matches_omitted_field_and_is_preserved_in_snapshot():
    omitted = audit_readiness(source(), mapping(), train_share=.7)
    config = mapping()
    config["fields"]["device_ref"] = None
    config["fields"]["merchant_ref"] = ""
    explicit_unmapped = audit_readiness(source(), config, train_share=.7)
    assert omitted["train"] == explicit_unmapped["train"]
    assert omitted["review_items"] == explicit_unmapped["review_items"]
    assert omitted["mapping"]["unmapped_transaction_fields"] == explicit_unmapped["mapping"]["unmapped_transaction_fields"]
    assert explicit_unmapped["mapping"]["snapshot"]["fields"]["device_ref"] is None
    assert explicit_unmapped["mapping"]["snapshot"]["fields"]["merchant_ref"] == ""
