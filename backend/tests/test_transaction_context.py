"""Causal windows, unknowns and legacy/serving parity for optional context."""

from types import SimpleNamespace
import json

import numpy as np
import pandas as pd
import pytest
from pandas.testing import assert_frame_equal

from app.ml.behavioral.features import FeatureInputError, build_features, feature_names, fit_vocabulary
from app.ml.behavioral.standardize import normalize_frame
from app.ml.behavioral.transaction_context import FEATURES, VERSION, VOCABULARY_KEY
from app.ml.lab.features import build_matrix
from app.ml.lab.mapping import apply_mapping, suggest
from app.ml.lab.scoring import definition_hash, verify
from app.ml.lab.trainer import train_logistic


def observations():
    start = pd.Timestamp("2026-01-02T12:00:00Z")
    rows = []
    for ref, minute, amount, direction, cp, channel in (
        ("in", 0, 1000, "CREDIT", "sender", "BANK"),
        ("small", 1, 10, "DEBIT", "recipient", "APP"),
        ("main", 3, 890, "DEBIT", "recipient", "APP"),
        ("peer", 3, 100, "DEBIT", "other", "QR"),
        ("later", 63, 50, "DEBIT", "other", "QR"),
    ):
        rows.append(dict(transaction_ref=ref, account_number="A", transaction_date=(start + pd.Timedelta(minutes=minute)).isoformat(),
                         amount=str(amount), currency="IDR", direction=direction, counterparty_ref=cp, channel=channel))
    return normalize_frame(pd.DataFrame(rows), "canonical").frame


def context(frame):
    vocabulary = fit_vocabulary(frame)
    vocabulary[VOCABULARY_KEY] = VERSION
    return build_features(frame, "FRAUD", vocabulary).set_index("transaction_ref")


def test_observed_burst_counterparty_jump_and_flow_arithmetic():
    result = context(observations())
    main = result.loc["main"]
    assert main.COUNT_R5M == 3  # current and strictly earlier, never its equal-time peer
    assert main.VALUE_R1H == 1900
    assert main.KNOWN_COUNTERPARTIES_R24H == 2
    assert main.COUNTERPARTY_COVERAGE_R24H == 1
    assert main.KNOWN_CHANNELS_R24H == 2
    assert main.OBSERVED_SAME_COUNTERPARTY_COUNT_R1H == 1
    assert main.AMOUNT_OVER_PRIOR_COUNTERPARTY_MIN_R1H == 89
    assert main.CREDIT_VALUE_R4H == 1000
    assert main.DEBIT_VALUE_R4H == 900
    assert main.OUT_IN_VALUE_RATIO_R4H == .9
    assert main.SECONDS_SINCE_PRIOR_CREDIT == 180
    assert result.loc["later"].OBSERVED_SAME_COUNTERPARTY_COUNT_R1H == 1  # inclusive left edge


def test_current_incoming_value_is_not_a_prior_credit_or_zero_denominator():
    result = context(observations())
    assert np.isnan(result.loc["in"].SECONDS_SINCE_PRIOR_CREDIT)
    assert result.loc["in"].OUT_IN_VALUE_RATIO_R4H == 0
    debit_only = observations().query("direction == 'DEBIT'")
    assert context(debit_only).OUT_IN_VALUE_RATIO_R4H.isna().all()


def test_future_and_equal_time_peer_changes_cannot_change_earlier_features():
    frame = observations()
    vocabulary = fit_vocabulary(frame.iloc[:2]) | {VOCABULARY_KEY: VERSION}
    baseline = build_features(frame, "FRAUD", vocabulary).set_index("transaction_ref")
    changed = frame.copy()
    changed.loc[changed.transaction_ref.eq("peer"), "amount"] = 999999
    changed.loc[changed.transaction_ref.eq("later"), "counterparty_ref"] = "unseen-future-answer"
    changed.loc[changed.transaction_ref.eq("later"), "direction"] = "CREDIT"
    actual = build_features(changed, "FRAUD", vocabulary).set_index("transaction_ref")
    assert_frame_equal(baseline.loc[["in", "small", "main"], list(FEATURES)], actual.loc[["in", "small", "main"], list(FEATURES)])
    past = frame[frame.transaction_ref.isin(["in", "small", "main"])]
    earlier = build_features(past, "FRAUD", vocabulary).set_index("transaction_ref")
    assert_frame_equal(baseline.loc[earlier.index, list(FEATURES)], earlier[list(FEATURES)])


def test_identifier_renaming_shuffle_and_answer_columns_do_not_change_context():
    original = observations()
    renamed = original.copy()
    renamed["counterparty_ref"] = renamed.counterparty_ref.map({"sender": "X", "recipient": "Y", "other": "Z"})
    renamed["is_fraud"] = 1
    renamed["pattern_code"] = "answer"
    renamed["catatan_reviewer"] = "label in text"
    renamed["merchant_name"] = "fraud"
    expected = context(original)[list(FEATURES)].sort_index()
    actual = context(renamed.sample(frac=1, random_state=4))[list(FEATURES)].sort_index()
    assert_frame_equal(expected, actual)


def test_missing_counterparties_are_unknown_and_known_count_is_a_lower_bound():
    frame = observations()
    frame.loc[frame.transaction_ref.eq("small"), "counterparty_ref"] = ""
    result = context(frame)
    assert np.isnan(result.loc["small"].OBSERVED_SAME_COUNTERPARTY_COUNT_R1H)
    assert np.isnan(result.loc["small"].AMOUNT_OVER_PRIOR_COUNTERPARTY_MIN_R1H)
    assert result.loc["main"].KNOWN_COUNTERPARTIES_R24H == 2
    assert result.loc["main"].COUNTERPARTY_COVERAGE_R24H == pytest.approx(2 / 3)
    assert np.isnan(result.loc["main"].AMOUNT_OVER_PRIOR_COUNTERPARTY_MIN_R1H)
    frame["counterparty_ref"] = ""
    frame["channel"] = "UNKNOWN"
    result = context(frame)
    assert result.KNOWN_COUNTERPARTIES_R24H.isna().all()
    assert result.COUNTERPARTY_COVERAGE_R24H.eq(0).all()
    assert result.KNOWN_CHANNELS_R24H.isna().all()


def test_day_only_history_does_not_invent_order_and_invalidates_overlapping_windows():
    frame = observations()
    day = frame.iloc[:1].copy()
    day["transaction_ref"] = "date-only"
    day["transaction_date"] = pd.Timestamp("2026-01-02T00:00:00Z")
    day["timestamp_precision"] = "day"
    day["source_timezone_known"] = False
    combined = pd.concat([frame, day], ignore_index=True)
    result = context(combined)
    assert result.loc["date-only", list(FEATURES)].isna().all()
    assert_frame_equal(context(frame)[list(FEATURES)], result.drop(index="date-only")[list(FEATURES)])
    next_day = frame.iloc[-1:].copy()
    next_day["transaction_ref"] = "after-day"
    next_day["transaction_date"] = pd.Timestamp("2026-01-03T00:02:00Z")
    result = context(pd.concat([combined, next_day], ignore_index=True))
    assert result.loc["after-day", list(FEATURES)].isna().all()
    next_day["transaction_date"] = pd.Timestamp("2026-01-03T05:00:00Z")
    result = context(pd.concat([combined, next_day], ignore_index=True))
    assert result.loc["after-day"].COUNT_R5M == 1
    assert np.isnan(result.loc["after-day"].KNOWN_COUNTERPARTIES_R24H)


def test_account_isolation_and_unbounded_ratio_are_not_misrepresented():
    frame = observations()
    other = frame.copy()
    other["account_number"] = "B"
    other["transaction_ref"] = "B-" + other.transaction_ref
    other["amount"] = other.amount.map(lambda value: value * 100)
    result = context(pd.concat([frame, other], ignore_index=True))
    assert_frame_equal(context(frame)[list(FEATURES)], result.loc[frame.transaction_ref, list(FEATURES)])
    frame.loc[frame.transaction_ref.eq("main"), "amount"] = 2000
    assert context(frame).loc["main"].OUT_IN_VALUE_RATIO_R4H > 1


def test_legacy_vocabulary_and_base_features_remain_identical():
    frame = observations()
    vocabulary = fit_vocabulary(frame)
    before = build_features(frame, "FRAUD", vocabulary)
    enabled = build_features(frame, "FRAUD", vocabulary | {VOCABULARY_KEY: VERSION})
    assert_frame_equal(before, enabled[before.columns])
    assert not set(FEATURES) & set(before)


@pytest.mark.parametrize("unit,version", [("AML", VERSION), ("FRAUD", "unknown-next-version")])
def test_incompatible_extension_is_refused(unit, version):
    frame = observations()
    with pytest.raises(FeatureInputError, match="Unsupported transaction context"):
        build_features(frame, unit, fit_vocabulary(frame) | {VOCABULARY_KEY: version})


def test_canonical_roundtrip_and_serving_parity(tmp_path):
    frame = observations()
    emitted = frame.copy()
    emitted["source_original"] = emitted.source_original.map(json.dumps)
    path = tmp_path / "canonical.csv"
    emitted.to_csv(path, index=False)
    restored = normalize_frame(pd.read_csv(path, dtype=str, keep_default_na=False), "canonical").frame
    assert_frame_equal(context(frame), context(restored))


def test_recipient_mapping_is_explicit_and_flow_group_refuses_default_direction():
    raw = pd.DataFrame({"transaction_ref": ["1", "2"], "account_number": ["A", "A"],
                        "transaction_date": ["2026-01-01T12:00:00Z", "2026-01-01T12:01:00Z"],
                        "amount": ["10", "100"], "counterparty_ref": ["B", "B"], "is_fraud": ["0", "1"]})
    mapping = suggest(raw)
    assert mapping["fields"]["counterparty_ref"] == "counterparty_ref"
    mapped = apply_mapping(raw, mapping)
    assert mapped.frame.counterparty_ref.tolist() == ["B", "B"]
    with pytest.raises(ValueError, match="kolom arah"):
        build_matrix(mapped.frame, np.ones(2, dtype=bool), ["arus"])
    matrix, vocabulary = build_matrix(mapped.frame, np.ones(2, dtype=bool), ["tujuan"])
    assert vocabulary[VOCABULARY_KEY] == VERSION
    assert matrix.AMOUNT_OVER_PRIOR_COUNTERPARTY_MIN_R1H.iloc[1] == 10


@pytest.mark.parametrize("missing", [None, np.nan, pd.NA])
def test_missing_mapped_counterparty_does_not_become_a_literal_identifier(missing):
    raw = pd.DataFrame({"transaction_ref": ["1"], "account_number": ["A"],
                        "transaction_date": ["2026-01-01T12:00:00Z"], "amount": ["10"],
                        "counterparty_ref": [missing], "is_fraud": ["0"]})
    mapping = suggest(raw) | {"positive_values": ["1"], "negative_values": ["0"]}
    mapped = apply_mapping(raw, mapping)
    assert mapped.frame.counterparty_ref.isna().all()  # canonical optional text uses null
    assert context(mapped.frame).KNOWN_COUNTERPARTIES_R24H.isna().all()


def test_artifact_requires_extension_marker_and_hash_includes_it():
    frame = observations()
    vocabulary = fit_vocabulary(frame) | {VOCABULARY_KEY: VERSION}
    matrix = build_features(frame, "FRAUD", vocabulary)
    names = ["AMOUNT", "COUNT_R5M"]
    text = train_logistic(matrix[names], np.array([0., 0., 1., 1., 0.]), seed=7)
    signature = definition_hash(text, names, vocabulary, .5)
    card = {"version": "context-test", "artefact_type": "LAB_LOGISTIC_JSON", "definition_hash": signature,
            "feature_set": {"version": "lab:behavioral_v1", "features": names, "vocabulary": vocabulary}, "model": {"threshold": .5}}
    model = SimpleNamespace(version="context-test", artefact_type="LAB_LOGISTIC_JSON", threshold=.5, unit="FRAUD",
                            feature_set_version="lab:behavioral_v1", model_text=text, model_card=card, definition_hash=signature)
    assert verify(model) == names
    vocabulary.pop(VOCABULARY_KEY)
    model.definition_hash = card["definition_hash"] = definition_hash(text, names, vocabulary, .5)
    assert model.definition_hash != signature
    with pytest.raises(ValueError, match="incompatible lab feature set"):
        verify(model)
