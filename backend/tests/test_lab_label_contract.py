"""Pure target-label guards: uncertain answers must never become normal data."""

from copy import deepcopy

import numpy as np
import pandas as pd
import pytest

from app.ml.lab.mapping import (
    BINARY_LABEL_PAIRS,
    LabDataError,
    apply_mapping,
    label_values,
    map_for_monitoring,
    normalize_label_cells,
    suggest,
)
from app.schemas.lab import LabMappingIn


def source(labels: list[object]) -> tuple[pd.DataFrame, dict]:
    count = len(labels)
    raw = pd.DataFrame({
        "transaction_ref": [f"T-{index}" for index in range(count)],
        "account_number": [f"A-{index % 2}" for index in range(count)],
        "transaction_date": [(pd.Timestamp("2026-01-01T00:00:00Z") + pd.Timedelta(hours=index)).isoformat()
                             for index in range(count)],
        "amount": [str(100 + index) for index in range(count)],
        "currency": ["IDR"] * count,
        "direction": ["OUT"] * count,
        "channel": ["MOBILE"] * count,
        "is_fraud": labels,
    })
    suggestion = suggest(raw.fillna(""))
    mapping = {key: suggestion[key] for key in
               ("fields", "label_column", "positive_values", "category_column", "date_format")}
    mapping["default_currency"] = "XXX"
    return raw, mapping


@pytest.mark.parametrize("positive,negative", list(BINARY_LABEL_PAIRS.items()))
def test_exact_legacy_binary_pairs_preserve_all_labels_and_transaction_rows(positive, negative):
    raw, mapping = source([positive, negative, positive, negative])
    mapping["positive_values"] = [positive]
    original = deepcopy(mapping)
    mapped = apply_mapping(raw, mapping)
    assert mapped.labels.tolist() == [1.0, 0.0, 1.0, 0.0]
    assert mapped.frame.transaction_ref.tolist() == raw.transaction_ref.tolist()
    assert mapped.frame.amount.astype(float).tolist() == [100, 101, 102, 103]
    assert mapping == original  # do not add inferred sets to frozen legacy JSON


def test_suggestion_only_suggests_binary_negative_values_present_in_source():
    raw, _ = source(["yes", "no", "REVIEW", ""])
    suggestion = suggest(raw)
    assert suggestion["positive_values"] == ["yes"]
    assert suggestion["negative_values"] == ["no"]
    raw, _ = source(["fraud", "legitimate"])
    assert suggest(raw)["negative_values"] == []


@pytest.mark.parametrize("value", ["REVIEW", "UNRESOLVED", "PENDING", "unknown", "typo", "2", "1.0",
                                  "nan", "None", "N/A"])
def test_unknown_nonblank_answers_are_refused_instead_of_becoming_normal(value):
    raw, mapping = source(["1", "0", value])
    mapping["positive_values"] = ["1"]
    with pytest.raises(LabDataError, match="belum dipetakan"):
        apply_mapping(raw, mapping)


def test_blank_and_native_missing_answers_are_excluded_and_counted():
    raw, mapping = source(["1", "0", "", "  ", None, np.nan, pd.NA])
    mapped = apply_mapping(raw, mapping)
    assert mapped.labels.tolist() == [1.0, 0.0]
    assert mapped.frame.transaction_ref.tolist() == ["T-0", "T-1"]
    assert mapped.report["missing_label"] == 5
    assert mapped.report["usable_rows"] == 2
    assert mapped.report["positives"] == mapped.report["negatives"] == 1


def test_explicit_custom_targets_normalise_case_and_whitespace():
    raw, mapping = source([" Investigation ", " CLEARED ", "investigation", "cleared"])
    mapping.update(positive_values=["INVESTIGATION "], negative_values=[" Cleared"])
    assert apply_mapping(raw, mapping).labels.tolist() == [1.0, 0.0, 1.0, 0.0]


def test_custom_target_requires_explicit_negative_answers():
    raw, mapping = source(["fraud", "normal"])
    mapping["positive_values"] = ["fraud"]
    with pytest.raises(LabDataError, match="negatif secara eksplisit"):
        apply_mapping(raw, mapping)
    mapping["negative_values"] = ["normal"]
    assert apply_mapping(raw, mapping).labels.tolist() == [1.0, 0.0]


def test_deliberately_selected_review_positive_is_allowed_as_a_review_target():
    raw, mapping = source(["REVIEW", "NORMAL"])
    mapping.update(positive_values=["review"], negative_values=["normal"])
    assert apply_mapping(raw, mapping).labels.tolist() == [1.0, 0.0]


@pytest.mark.parametrize("negative", ["REVIEW", "pending", "UNRESOLVED", " unknown ", "belum ditinjau"])
def test_unresolved_answers_cannot_be_explicitly_declared_normal(negative):
    with pytest.raises(LabDataError, match="tidak boleh menjadi label negatif"):
        label_values({"positive_values": ["1"], "negative_values": [negative]})


@pytest.mark.parametrize("positive,negative,message", [
    (["1"], [" 1 "], "tumpang tindih"),
    (["1", "0"], None, "tumpang tindih"),
    (["1"], [], "minimal satu"),
    ([], ["0"], "minimal satu"),
    (["1"], [None], "kosong/null"),
    (["1"], [np.nan], "kosong/null"),
    (["1"], ["none"], "kosong/null"),
    (["1"], [""], "kosong/null"),
    ([None], ["0"], "kosong/null"),
    (["1"], [["0"]], "bukan daftar/objek"),
    (["1"], [{"normal": "0"}], "bukan daftar/objek"),
])
def test_ambiguous_target_contracts_are_refused(positive, negative, message):
    with pytest.raises(LabDataError, match=message):
        label_values({"positive_values": positive, "negative_values": negative})


def test_label_alignment_follows_accepted_source_ordinals_after_quarantine():
    raw, mapping = source(["1", "unresolved", "0", "1"])
    raw.loc[1, "transaction_date"] = "invalid date"
    mapped = apply_mapping(raw, mapping)
    assert mapped.report["quarantined"] == 1
    assert mapped.frame.transaction_ref.tolist() == ["T-0", "T-2", "T-3"]
    assert mapped.labels.tolist() == [1.0, 0.0, 1.0]


def test_monitoring_still_ignores_labels_including_unknown_answers_and_config():
    raw, mapping = source(["REVIEW", "typo", None])
    mapping.update(positive_values=["unconfirmed"], negative_values=["pending"])
    first = map_for_monitoring(raw, mapping)
    poisoned = raw.copy()
    poisoned["is_fraud"] = ["1", "0", "1"]
    second = map_for_monitoring(poisoned, mapping)
    pd.testing.assert_frame_equal(first.frame, second.frame)
    assert first.report == second.report
    assert first.report["accepted"] == 3


def test_normalised_cells_do_not_mutate_source_or_stringify_native_missing():
    original = pd.Series([" YES ", None, np.nan, pd.NA, "NaN", "0"])
    before = original.copy()
    assert normalize_label_cells(original).tolist() == ["yes", "", "", "", "nan", "0"]
    pd.testing.assert_series_equal(original, before)


def test_schema_accepts_legacy_mapping_and_explicit_negative_contract():
    _, mapping = source(["1", "0"])
    legacy = LabMappingIn(**mapping)
    assert legacy.negative_values is None
    strict = LabMappingIn(**{**mapping, "negative_values": ["0"]})
    assert strict.negative_values == ["0"]


def test_mapping_api_rejects_review_answer_without_persisting_mapping_or_audit(client, auth_headers, db):
    import uuid

    from sqlalchemy import func, select

    from app.ml.lab.mapping import read_csv_bytes
    from app.models.audit_log import AuditLog
    from app.models.enums import UserRole
    from app.models.lab import LabDataset
    from lab_helpers import make_dataset, mapping_for

    headers = auth_headers(UserRole.ROLE_ANALYST)
    raw = read_csv_bytes(make_dataset(600, defects=False))
    raw.loc[0, "is_fraud"] = "REVIEW"
    uploaded = client.post("/lab/datasets", headers=headers,
                           files={"file": ("pending.csv", raw.to_csv(index=False).encode(), "text/csv")})
    assert uploaded.status_code == 201, uploaded.text
    dataset_id = uploaded.json()["id"]
    before = db.scalar(select(func.count()).select_from(AuditLog))
    mapping = {**mapping_for(raw), "negative_values": ["no"]}
    response = client.post(f"/lab/datasets/{dataset_id}/mapping", headers=headers, json=mapping)
    assert response.status_code == 422, response.text
    assert "belum dipetakan" in response.json()["detail"]
    db.expire_all()
    stored = db.get(LabDataset, uuid.UUID(dataset_id))
    assert stored.mapping is None and stored.validation is None and stored.status == "UPLOADED"
    assert db.scalar(select(func.count()).select_from(AuditLog)) == before


def test_explicit_negative_contract_survives_train_save_approval_and_monitoring(client, auth_headers, db):
    import uuid

    from app.ml.lab.features import FEATURE_GROUPS
    from app.models.enums import UserRole
    from app.models.ml import ModelVersion
    from lab_helpers import make_dataset

    analyst, mlro, data_ops = (auth_headers(role) for role in
                              (UserRole.ROLE_ANALYST, UserRole.ROLE_MLRO, UserRole.ROLE_DATA_OPS))
    uploaded = client.post("/lab/datasets", headers=analyst,
                           files={"file": ("explicit.csv", make_dataset(1500, seed=17), "text/csv")})
    assert uploaded.status_code == 201, uploaded.text
    dataset = uploaded.json()
    suggestion = dataset["suggestion"]
    mapping = {key: suggestion[key] for key in
               ("fields", "label_column", "positive_values", "negative_values", "category_column", "date_format")}
    assert mapping["positive_values"] == ["yes"] and mapping["negative_values"] == ["no"]
    mapped = client.post(f"/lab/datasets/{dataset['id']}/mapping", headers=analyst, json=mapping)
    assert mapped.status_code == 200, mapped.text
    frozen_mapping = mapped.json()["mapping"]
    trained = client.post(f"/lab/datasets/{dataset['id']}/runs", headers=analyst, json={
        "feature_groups": [group["key"] for group in FEATURE_GROUPS],
        "models": ["logistic_regression"], "train_share": .6,
    })
    assert trained.status_code == 201, trained.text
    run = trained.json()
    assert run["config"]["mapping_snapshot"] == frozen_mapping
    assert client.post(f"/lab/datasets/{dataset['id']}/mapping", headers=analyst,
                       json=frozen_mapping).status_code == 200
    candidate = run["results"]["models"][0]
    saved = client.post(f"/lab/runs/{run['id']}/save", headers=analyst, json={
        "model_key": "logistic_regression", "threshold_index": candidate["default_index"],
    })
    assert saved.status_code == 200, saved.text
    version_id = saved.json()["model_version_id"]
    version = db.get(ModelVersion, uuid.UUID(version_id))
    assert version.model_card["training_data"]["mapping_snapshot"] == frozen_mapping
    assert version.model_card["training_data"]["mapping_sha256"] == run["config"]["mapping_sha256"]
    submitted = client.post(f"/lab/models/{version_id}/submit", headers=analyst,
                            json={"justification": "Label positif dan negatif telah dipetakan secara eksplisit."})
    assert submitted.status_code == 200, submitted.text
    approved = client.post(f"/lab/models/{version_id}/approve", headers=mlro,
                           json={"note": "Disetujui untuk uji kompatibilitas pemetaan data sintetis.",
                                 "model_alerts": False})
    assert approved.status_code == 200, approved.text
    monitored = client.post(f"/lab/datasets/{dataset['id']}/monitor", headers=data_ops,
                            files={"file": ("new.csv", make_dataset(100, seed=81, defects=False), "text/csv")})
    assert monitored.status_code == 200, monitored.text
    assert monitored.json()["accepted"] == 100
    assert monitored.json()["models"][0]["units_scored"] == 100
