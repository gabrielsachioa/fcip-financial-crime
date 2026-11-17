"""Score and explain with a model saved from the lab.

Every score comes with its reasons (FRD NG-07, BR-401.3; TRD ADR-007): the
features that pushed this one transaction's score up or down, on a scale that
depends on the model type and is named by `explanation_method`:

- Logistic Regression: `linear_log_odds` — each feature's weight times its
  standardised value. Exact and additive: the contributions plus the intercept
  are the score's log-odds.
- LightGBM: `tree_shap_log_odds` — TreeSHAP contributions (LightGBM's
  `pred_contrib`), additive on the log-odds scale, as Jevon's earlier models.
- Isolation Forest: `median_replacement_score_difference` — how much the score
  drops when that feature is set to its training median (the same method as
  `app/ml/behavioral/model.py`). Not additive.

A contribution explains the model's arithmetic, not why a person acted.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
import pandas as pd

from app.ml.behavioral.features import FEATURE_SET_VERSION, feature_names
from app.ml.lab.trainer import LOGISTIC_FORMAT, score_lightgbm, score_logistic

LAB_FEATURE_SET_VERSION = f"lab:{FEATURE_SET_VERSION}"
UNIT = "FRAUD"
ARTEFACT_LOGISTIC = "LAB_LOGISTIC_JSON"
ARTEFACT_LIGHTGBM = "LAB_LIGHTGBM_TEXT"
ARTEFACT_ISOLATION = "LAB_ISOLATION_FOREST_JSON"
LAB_ARTEFACTS = (ARTEFACT_LOGISTIC, ARTEFACT_LIGHTGBM, ARTEFACT_ISOLATION)
EXPLANATION_METHOD = {
    ARTEFACT_LOGISTIC: "linear_log_odds",
    ARTEFACT_LIGHTGBM: "tree_shap_log_odds",
    ARTEFACT_ISOLATION: "median_replacement_score_difference",
}
SCORE_KIND = {
    ARTEFACT_LOGISTIC: "supervised_probability",
    ARTEFACT_LIGHTGBM: "supervised_probability",
    ARTEFACT_ISOLATION: "anomaly_score",
}
TOP_CONTRIBUTIONS = 8


def is_lab_artefact(artefact_type: str) -> bool:
    return artefact_type in LAB_ARTEFACTS


def _signed_log(a: np.ndarray) -> np.ndarray:
    return np.sign(a) * np.log1p(np.abs(a))


def _top(features: list[str], values: np.ndarray, contributions: np.ndarray, n: int) -> list[dict]:
    order = np.argsort(-np.abs(contributions), kind="stable")[:n]
    return [{"feature": features[i],
             "value": float(values[i]) if math.isfinite(values[i]) else None,
             "contribution": round(float(contributions[i]), 4)} for i in order]


@dataclass
class LabPredictor:
    artefact_type: str
    model_text: str
    features: list[str]

    def scores(self, frame: pd.DataFrame) -> np.ndarray:
        X = frame.loc[:, self.features]
        if not len(X):
            return np.zeros(0, dtype=float)
        if self.artefact_type == ARTEFACT_LOGISTIC:
            return score_logistic(self.model_text, X)
        if self.artefact_type == ARTEFACT_LIGHTGBM:
            return score_lightgbm(self.model_text, X)
        from app.ml.behavioral.model import predict_model

        return predict_model(self.model_text, X)

    def explain(self, frame: pd.DataFrame, top_n: int = TOP_CONTRIBUTIONS) -> list[list[dict]]:
        X = frame.loc[:, self.features]
        if not len(X):
            return []
        values = X.to_numpy(dtype=float)
        if self.artefact_type == ARTEFACT_ISOLATION:
            from app.ml.behavioral.model import explain_model

            return explain_model(self.model_text, X, top_n)
        if self.artefact_type == ARTEFACT_LOGISTIC:
            m = json.loads(self.model_text)
            medians, means, scales = (np.asarray(m[k], dtype=float) for k in ("medians", "means", "scales"))
            z = (_signed_log(np.where(np.isnan(values), medians, values)) - means) / scales
            contributions = z * np.asarray(m["coef"], dtype=float)
        else:
            booster = _booster(self.model_text)
            contributions = booster.predict(X.loc[:, booster.feature_name()], pred_contrib=True)[:, :-1]
            if booster.feature_name() != self.features:
                order = [booster.feature_name().index(f) for f in self.features]
                contributions = contributions[:, order]
        return [_top(self.features, values[r], contributions[r], top_n) for r in range(len(X))]


@lru_cache(maxsize=4)
def _booster(model_text: str):
    import lightgbm as lgb

    return lgb.Booster(model_str=model_text)


def load_predictor(artefact_type: str, model_text: str, features: list[str]) -> LabPredictor:
    if not is_lab_artefact(artefact_type):
        raise ValueError(f"Not a lab artefact: {artefact_type}")
    return LabPredictor(artefact_type, model_text, list(features))


def _canonical(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def definition_hash(model_text: str, features: list[str], vocabulary: dict, threshold: float) -> str:
    """SHA-256 of everything that decides a lab model's scores (TRD §10.5)."""
    return hashlib.sha256("\n".join((
        model_text, _canonical(features), _canonical(vocabulary), LAB_FEATURE_SET_VERSION, repr(float(threshold)),
    )).encode()).hexdigest()


def _verify_logistic_payload(model_text: str, features: list[str]) -> None:
    """A valid hash does not make malformed arithmetic safe to execute."""
    payload = json.loads(model_text)
    if (not isinstance(payload, dict) or payload.get("format") != LOGISTIC_FORMAT
            or payload.get("features") != features):
        raise ValueError("Invalid lab logistic model format or feature order")
    for name in ("medians", "means", "scales", "coef"):
        try:
            values = np.asarray(payload.get(name), dtype=float)
        except (TypeError, ValueError, OverflowError) as exc:
            raise ValueError(f"Invalid lab logistic {name}") from exc
        if values.shape != (len(features),) or not np.isfinite(values).all():
            raise ValueError(f"Invalid lab logistic {name}")
        if name == "scales" and np.any(values <= 0):
            raise ValueError("Lab logistic scales must be positive")
    try:
        intercept = float(payload["intercept"])
    except (KeyError, TypeError, ValueError, OverflowError) as exc:
        raise ValueError("Invalid lab logistic intercept") from exc
    if not math.isfinite(intercept):
        raise ValueError("Invalid lab logistic intercept")


def verify(version) -> list[str]:
    """The model's features, after checking that what is stored is exactly what was saved
    and that this checkout computes the same features. Raises ValueError otherwise."""
    card = version.model_card
    context = card["feature_set"]
    features = context["features"]
    if (not isinstance(features, list) or not features
            or any(not isinstance(name, str) for name in features)
            or len(features) != len(set(features))):
        raise ValueError(f"{version.version}: invalid lab model feature registry")
    if not math.isfinite(version.threshold) or not 0 <= version.threshold <= 1:
        raise ValueError(f"{version.version}: lab threshold must be finite and between zero and one")
    vocabulary = context["vocabulary"]
    if definition_hash(version.model_text, features, vocabulary, version.threshold) != version.definition_hash \
            or card.get("definition_hash") != version.definition_hash:
        raise ValueError(f"{version.version}: stored content does not match its definition_hash")
    if (version.feature_set_version != LAB_FEATURE_SET_VERSION or context.get("version") != LAB_FEATURE_SET_VERSION
            or vocabulary.get("feature_set_version") != FEATURE_SET_VERSION
            or not features or not set(features) <= set(feature_names(UNIT))):
        raise ValueError(f"{version.version}: incompatible lab feature set")
    if (card.get("version") != version.version or card.get("artefact_type") != version.artefact_type
            or version.unit != UNIT or card["model"].get("threshold") != version.threshold):
        raise ValueError(f"{version.version}: inconsistent model-card semantics")
    if version.artefact_type == ARTEFACT_LIGHTGBM:
        names = _booster(version.model_text).feature_name()
        if sorted(names) != sorted(features):
            raise ValueError(f"{version.version}: model features differ from its card")
    elif version.artefact_type == ARTEFACT_LOGISTIC:
        _verify_logistic_payload(version.model_text, features)
    elif version.artefact_type == ARTEFACT_ISOLATION:
        from app.ml.behavioral.model import load_model

        if load_model(version.model_text).features != features:
            raise ValueError(f"{version.version}: model feature order differs from its card")
    else:
        raise ValueError(f"{version.version}: unsupported lab artefact type")
    return features
