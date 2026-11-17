"""Invalid predictions must fail visibly instead of becoming negative flags."""

from __future__ import annotations

import copy
import json
import uuid
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from app.ml.behavioral.features import FEATURE_SET_VERSION
from app.ml.lab.scoring import (
    ARTEFACT_LOGISTIC,
    LAB_FEATURE_SET_VERSION,
    definition_hash,
    load_predictor,
    verify,
)
from app.ml.lab.trainer import LOGISTIC_FORMAT
from app.services.ml_scoring import (
    LoadedModel,
    ModelIntegrityError,
    _validated_explanations,
    _validated_scores,
    score_all,
)


def _version(*, threshold=0.5, payload_change=None, features=None):
    features = ["AMOUNT"] if features is None else features
    payload = {
        "format": LOGISTIC_FORMAT, "features": features, "medians": [0.0],
        "means": [0.0], "scales": [1.0], "coef": [0.25], "intercept": -1.0,
    }
    payload.update(payload_change or {})
    model_text = json.dumps(payload)
    vocabulary = {"feature_set_version": FEATURE_SET_VERSION, "currency": "IDR"}
    digest = definition_hash(model_text, features, vocabulary, threshold)
    return SimpleNamespace(
        id=uuid.uuid4(), version="serving-test", unit="FRAUD", artefact_type=ARTEFACT_LOGISTIC,
        feature_set_version=LAB_FEATURE_SET_VERSION, threshold=threshold, model_text=model_text,
        definition_hash=digest,
        model_card={
            "version": "serving-test", "artefact_type": ARTEFACT_LOGISTIC, "definition_hash": digest,
            "feature_set": {"version": LAB_FEATURE_SET_VERSION, "features": features, "vocabulary": vocabulary},
            "model": {"threshold": threshold},
        },
    )


@pytest.mark.parametrize("threshold", [np.nan, np.inf, -np.inf, -0.1, 1.1])
def test_lab_integrity_refuses_invalid_thresholds_even_with_matching_hash(threshold):
    with pytest.raises(ValueError, match="threshold"):
        verify(_version(threshold=threshold))


@pytest.mark.parametrize("features", [[], ["AMOUNT", "AMOUNT"], "AMOUNT"])
def test_lab_integrity_requires_a_unique_feature_registry(features):
    with pytest.raises(ValueError, match="feature registry"):
        verify(_version(features=features))


@pytest.mark.parametrize("change", [
    {"scales": [0.0]}, {"scales": [-1.0]}, {"scales": [np.nan]},
    {"coef": [np.inf]}, {"means": []}, {"medians": [0.0, 1.0]},
    {"intercept": np.nan}, {"format": "unsupported"},
])
def test_lab_integrity_refuses_invalid_logistic_arithmetic(change):
    with pytest.raises(ValueError, match="logistic"):
        verify(_version(payload_change=change))


@pytest.mark.parametrize("threshold", [0.0, 0.5, 1.0])
def test_valid_logistic_prediction_values_are_unchanged(threshold):
    version = _version(threshold=threshold)
    assert verify(version) == ["AMOUNT"]
    frame = pd.DataFrame({"AMOUNT": [0.0, 10.0, np.nan]})
    actual = load_predictor(version.artefact_type, version.model_text, ["AMOUNT"]).scores(frame)
    expected = 1 / (1 + np.exp(-(np.log1p([0.0, 10.0, 0.0]) * 0.25 - 1)))
    np.testing.assert_array_equal(actual, expected)


@pytest.mark.parametrize("scores", [
    [np.nan, 0.2], [np.inf, 0.2], [-np.inf, 0.2], [0.5], [[0.5], [0.2]],
])
def test_score_guard_refuses_missing_nonfinite_or_misaligned_predictions(scores):
    with pytest.raises(ModelIntegrityError, match="one finite score"):
        _validated_scores(_version(), scores, 2)


def test_shared_guard_preserves_unbounded_finite_legacy_score_scales():
    values = np.array([-10.0, 4.0])
    np.testing.assert_array_equal(_validated_scores(_version(), values, 2), values)


def test_shared_guard_rejects_a_nonfinite_legacy_threshold():
    with pytest.raises(ModelIntegrityError, match="threshold must be finite"):
        _validated_scores(_version(threshold=np.inf), [0.2, 0.8], 2)


def test_model_loading_refuses_a_nonfinite_threshold_even_without_observations():
    from app.services.ml_scoring import verify as serving_verify

    version = _version(threshold=np.inf)
    version.artefact_type = "ANOMALY_MODEL"
    with pytest.raises(ModelIntegrityError, match="threshold must be finite"):
        serving_verify(version)


def _explanation():
    return [{"feature": "AMOUNT", "value": None, "contribution": 0.25}]


@pytest.mark.parametrize("explanations", [
    [], [[]], [[{"feature": "AMOUNT", "value": 1.0, "contribution": np.nan}]],
    [[{"feature": "AMOUNT", "value": np.inf, "contribution": 0.2}]],
    [[{"feature": "", "value": 1.0, "contribution": 0.2}]],
])
def test_explanation_guard_refuses_truncation_and_invalid_evidence(explanations):
    with pytest.raises(ModelIntegrityError):
        _validated_explanations(_version(), explanations, 1)


def test_explanation_guard_keeps_missing_feature_values_explicit():
    values = [_explanation()]
    assert _validated_explanations(_version(), values, 1) is values
    assert _validated_explanations(_version(), [], 0) == []


class _NoWritesDatabase:
    """Only the score run's read operations; writes would be an assertion failure."""

    def scalars(self, *_args):
        return []

    def query(self, *_args):
        return self

    def filter(self, *_args):
        return self

    def count(self):
        return 0

    def execute(self, *_args):
        pytest.fail("Invalid scores/explanations must be rejected before inserting a score")


@pytest.mark.parametrize("scores,explanations,reason", [
    ([np.nan, 0.8], [_explanation()], "finite score"),
    ([0.8, 0.9], [_explanation()], "one explanation"),
    ([0.8, 0.2], [[{"feature": "AMOUNT", "value": 10.0, "contribution": np.inf}]], "contribution"),
])
def test_serving_rejects_failed_predictions_before_any_score_insert(monkeypatch, scores, explanations, reason):
    import app.ml.behavioral.features as feature_module
    import app.services.ml_scoring as serving

    now = pd.Timestamp("2026-11-17T10:00:00Z")
    frame = pd.DataFrame({
        "account_number": ["A", "A"], "transaction_ref": ["T1", "T2"],
        "as_of": [now, now + pd.Timedelta(seconds=1)], "AMOUNT": [10.0, 20.0],
    })
    monkeypatch.setattr(feature_module, "build_features", lambda *_args: frame.copy())
    monkeypatch.setattr(serving, "behavioral_frame_from_db", lambda *_args: (
        frame.copy(), {"A": uuid.uuid4()}, {"T1": uuid.uuid4(), "T2": uuid.uuid4()},
    ))
    predictor = SimpleNamespace(scores=lambda _frame: np.asarray(scores),
                                explain=lambda *_args: copy.deepcopy(explanations))
    model = LoadedModel(_version(), predictor, ["AMOUNT"])
    with pytest.raises(ModelIntegrityError, match=reason):
        score_all(_NoWritesDatabase(), uuid.uuid4(), {"FRAUD": model})
