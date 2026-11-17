"""Incremental ML findings retain new flags without changing reviewed evidence."""

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import uuid

import pytest
from sqlalchemy import func, select

from app.models.alert import Alert, AlertTransaction
from app.models.audit_log import AuditLog
from app.models.case import Case
from app.models.enums import AlertStatus, CaseStatus, RuleState, UserRole
from app.models.ml import MlScore, ModelVersion
from app.models.rule import Rule, RuleVersion
from app.models.user import User
from app.services.ml_scoring import raise_ml_alerts

from pattern_world import World


DAY = datetime(2026, 11, 17, tzinfo=timezone.utc)


def _world(db):
    world = World(db)
    customer = world.customer("INCREMENTAL-FLAGS")
    account = world.account(customer)
    version = ModelVersion(
        artefact_type="LAB_LOGISTIC_JSON", version="incremental-fraud-model",
        definition_hash="a" * 64, state=RuleState.ACTIVE, unit="FRAUD", feature_set_version="lab:behavioral_v1",
        threshold=0.5, model_text="unused: alert-only fixture without model fitting",
        model_card={"feature_set": {"definitions": {"AMOUNT": "Observed amount"}}},
        correlation_id=uuid.uuid4(),
    )
    db.add(version)
    rule = db.scalar(select(RuleVersion).join(Rule).where(Rule.pattern_code == "ML_SCORE"))
    rule.state = RuleState.ACTIVE
    db.commit()
    return world, customer, account, version


def _score(db, world, customer, account, version, hour, value):
    instant = DAY + timedelta(hours=hour)
    transaction = world.tx(account, instant, 1000 + hour)
    world.done()
    score = MlScore(
        model_version_id=version.id, unit="FRAUD", customer_id=customer.id,
        transaction_id=transaction.id, as_of=instant, score=value, threshold=0.5, flagged=True,
        contributions=[{"feature": "AMOUNT", "value": float(transaction.amount), "contribution": value / 10}],
        detection_run_id=uuid.uuid4(),
    )
    db.add(score)
    db.commit()
    return score, transaction


def _run(db):
    result = raise_ml_alerts(db, uuid.uuid4(), None)
    db.commit()
    return result


def _links(db, alert):
    return set(db.scalars(select(AlertTransaction.transaction_id).where(AlertTransaction.alert_id == alert.id)))


def _alerts(db):
    return db.scalars(select(Alert).where(Alert.pattern_code == "ML_SCORE").order_by(Alert.created_at, Alert.id)).all()


def test_new_same_day_flags_extend_open_finding_and_preserve_creation_snapshot(db):
    world, customer, account, version = _world(db)
    first, tx1 = _score(db, world, customer, account, version, 10, 0.6)
    assert _run(db)[1:] == (1, 0)
    [alert] = _alerts(db)
    original = {"reason": alert.reason, "detection_details": deepcopy(alert.detection_details)}
    score_snapshot = (first.score, first.threshold, deepcopy(first.contributions), first.detection_run_id)

    second, tx2 = _score(db, world, customer, account, version, 12, 0.95)
    assert _run(db)[1:] == (0, 1)
    assert len(_alerts(db)) == 1 and _links(db, alert) == {tx1.id, tx2.id}
    assert alert.status is AlertStatus.OPEN
    assert alert.detection_details["SCORE_IDS"] == [str(first.id), str(second.id)]
    assert alert.detection_details["SCORE"] == 0.95
    assert alert.detection_details["CONTRIBUTIONS"] == second.contributions
    assert alert.detection_details["CREATION_SNAPSHOT"] == original
    assert alert.detection_details["DETECTION_RUN_ID"] == original["detection_details"]["DETECTION_RUN_ID"]
    assert "2 transaction(s)" in alert.reason
    assert datetime.fromisoformat(alert.detection_details["window_end"]) == second.as_of

    # A later upload may carry an earlier event time; all stored flags remain visible.
    third, tx3 = _score(db, world, customer, account, version, 8, 0.8)
    assert _run(db)[1:] == (0, 1)
    assert _links(db, alert) == {tx1.id, tx2.id, tx3.id}
    assert datetime.fromisoformat(alert.detection_details["window_start"]) == third.as_of
    assert alert.detection_details["SCORE"] == 0.95
    assert alert.detection_details["CREATION_SNAPSHOT"] == original
    assert alert.detection_details["SUPPRESSION_COUNT"] == 2
    db.refresh(first)
    assert (first.score, first.threshold, first.contributions, first.detection_run_id) == score_snapshot

    events = db.scalars(select(AuditLog).where(
        AuditLog.object_id == alert.id, AuditLog.action == "ALERT_SUPPRESSED_AS_DUPLICATE",
    ).order_by(AuditLog.created_at, AuditLog.id)).all()
    assert len(events) == 2
    assert {tuple(event.details["NOVEL_SCORE_IDS"]) for event in events} == {(str(second.id),), (str(third.id),)}
    assert all(event.from_state == event.to_state == "OPEN" and event.details["novel_score_count"] == 1
               for event in events)
    assert {value for event in events for value in event.details["NEW_TRANSACTION_IDS"]} == {str(tx2.id), str(tx3.id)}


def test_exact_rerun_adds_no_alert_link_or_novel_score(db):
    world, customer, account, version = _world(db)
    score, transaction = _score(db, world, customer, account, version, 10, 0.7)
    assert _run(db)[1:] == (1, 0)
    [alert] = _alerts(db)
    for _ in range(2):
        assert _run(db)[1:] == (0, 1)
    assert len(_alerts(db)) == 1 and _links(db, alert) == {transaction.id}
    assert alert.detection_details["SCORE_IDS"] == [str(score.id)]
    assert alert.detection_details["SUPPRESSION_COUNT"] == 2
    assert len(alert.detection_details["SUPPRESSED_OCCURRENCES"]) == 2
    events = db.scalars(select(AuditLog).where(AuditLog.action == "ALERT_SUPPRESSED_AS_DUPLICATE")).all()
    assert len(events) == 2
    assert all(event.details["novel_score_count"] == 0 and event.details["NOVEL_SCORE_IDS"] == []
               and event.details["NEW_TRANSACTION_IDS"] == [] for event in events)
    assert db.scalar(select(func.count()).select_from(MlScore)) == 1


@pytest.mark.parametrize("state,case_state", [
    (AlertStatus.DISPOSED, None), (AlertStatus.ESCALATED, None),
    (AlertStatus.OPEN, CaseStatus.OPEN), (AlertStatus.OPEN, CaseStatus.CLOSED),
])
def test_reviewed_or_case_linked_finding_is_not_mutated_and_new_flags_get_related_alert(db, state, case_state):
    world, customer, account, version = _world(db)
    first, tx1 = _score(db, world, customer, account, version, 10, 0.7)
    _run(db)
    [prior] = _alerts(db)
    prior.status = state
    if case_state is not None:
        user = User(email="incremental-investigator@fcip.internal", hashed_password="unused",
                    full_name="Incremental investigator", role=UserRole.ROLE_INVESTIGATOR)
        db.add(user)
        db.flush()
        case = Case(case_number="CASE-INCREMENTAL", status=case_state, opened_by=user.id)
        db.add(case)
        db.flush()
        prior.case_id = case.id
    db.commit()
    original = (prior.reason, deepcopy(prior.detection_details), prior.status, prior.case_id)

    # Historical scores alone do not endlessly resurrect an already reviewed finding.
    assert _run(db)[1:] == (0, 1)
    second, tx2 = _score(db, world, customer, account, version, 12, 0.9)
    assert _run(db)[1:] == (1, 0)
    alerts = _alerts(db)
    assert len(alerts) == 2
    current = next(alert for alert in alerts if alert.id != prior.id)
    assert current.status is AlertStatus.OPEN and current.case_id is None
    assert current.detection_details["SCORE_IDS"] == [str(second.id)]
    assert current.detection_details["RELATED_PRIOR"] == [str(prior.id)]
    assert _links(db, current) == {tx2.id} and _links(db, prior) == {tx1.id}
    db.refresh(prior)
    assert (prior.reason, prior.detection_details, prior.status, prior.case_id) == original

    assert _run(db)[1:] == (0, 1)
    assert current.detection_details["SCORE_IDS"] == [str(second.id)]
    assert _links(db, current) == {tx2.id} and len(_alerts(db)) == 2
    db.refresh(first)
    assert first.score == 0.7 and first.flagged
