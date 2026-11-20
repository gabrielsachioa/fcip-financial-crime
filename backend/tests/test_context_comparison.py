"""Protect validation-only experimentation and honest matched comparisons."""

import hashlib
import json

import numpy as np
import pytest

from app.ml.lab.mapping import apply_mapping, read_csv_bytes
from app.ml.lab.trainer import chronological_split
from app.scripts import compare_transaction_context as compare
from lab_helpers import make_dataset, mapping_for


def test_matched_comparison_preserves_pattern_catches_even_when_total_recall_is_equal():
    y = np.array([1., 1., 0., 0.])
    categories = np.array(["A", "B", "", ""])
    scores = np.array([.3, .9, .5, .1])
    result = compare.matched_point(scores, y, categories, {"tp": 1, "fp": 0}, {"A": {"caught": 1}})
    assert result["tp"] == 2 and result["fp"] == 1
    assert result["patterns"]["A"]["caught"] == 1
    assert result["no_more_false_positives"] is False  # reject a superficially better recall that misses A


def test_matched_comparison_exposes_strict_improvement_without_inventing_a_bank_target():
    scores = np.array([.9, .8, .2, .1])
    y = np.array([1., 1., 0., 0.])
    result = compare.matched_point(scores, y, np.array(["A", "B", "", ""]), {"tp": 1, "fp": 1}, {"A": {"caught": 1}})
    assert result["tp"] == 2 and result["fp"] == 0
    assert result["no_more_false_positives"] and result["strict_improvement"]


@pytest.fixture
def comparison_input(tmp_path):
    data = tmp_path / "source.csv"
    data.write_bytes(make_dataset(900, defects=False))
    raw = read_csv_bytes(data.read_bytes())
    mapping = mapping_for(raw)
    mapping["negative_values"] = ["no"]
    mapping_path = tmp_path / "mapping.json"
    mapping_path.write_text(json.dumps(mapping))
    return data, mapping_path, hashlib.sha256(data.read_bytes()).hexdigest(), tmp_path / "new-experiment"


def test_comparison_requires_original_source_hash_and_refuses_existing_output(comparison_input):
    data, mapping, digest, out = comparison_input
    with pytest.raises(ValueError, match="pinned source"):
        compare.run(data, mapping, "0" * 64, out, .7)
    assert not out.exists()
    out.mkdir()
    with pytest.raises(FileExistsError, match="overwrite"):
        compare.run(data, mapping, digest, out, .7)


def test_comparison_scores_only_validation_and_does_not_import_future_target_into_features(comparison_input, monkeypatch):
    data, mapping_path, digest, out = comparison_input
    mapping = json.loads(mapping_path.read_text())
    mapped = apply_mapping(read_csv_bytes(data.read_bytes()), mapping)
    parts = chronological_split(mapped.frame, .7)
    expected_val = np.flatnonzero(parts == "validation").tolist()
    original_score = compare.score
    calls = []
    def checked_score(key, text, matrix):
        assert matrix.index.tolist() == expected_val
        calls.append(len(matrix))
        return original_score(key, text, matrix)
    monkeypatch.setattr(compare, "score", checked_score)
    monkeypatch.setattr(compare, "MODEL_KEYS", ["logistic_regression"])
    report = compare.run(data, mapping_path, digest, out, .7)
    assert len(calls) == 4
    assert report["protocol"]["test_scores_computed"] is False
    assert report["protocol"]["test_outcomes_disclosed"] is False
    assert report["protocol"]["registered_or_activated"] is False
    assert hashlib.sha256(data.read_bytes()).hexdigest() == digest
    assert "positives" not in json.loads((out / "context_training.json").read_text())["split"]["test"]
    assert (out / "results.json").is_file()


def test_comparison_refuses_implicit_negative_mapping(comparison_input):
    data, mapping_path, digest, out = comparison_input
    mapping = json.loads(mapping_path.read_text())
    mapping.pop("negative_values")
    mapping_path.write_text(json.dumps(mapping))
    with pytest.raises(ValueError, match="explicit negative"):
        compare.run(data, mapping_path, digest, out, .7)
    assert not out.exists()
