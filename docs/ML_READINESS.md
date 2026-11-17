# ML readiness and data needed — 17 November 2026

Jevon authorises improvements to the deficiencies identified in the readiness
review, prioritising ML transaction flags. This first implementation hardens
label handling and inference and adds a descriptive development-data audit.
It does not establish new fraud/AML labels, acceptance targets or model quality.
The operational target in PROJECT_CONTEXT §22 still needs Jevon/mentor input.

## What a flag means

A flag is a hypothesis for human review, not a finding of criminal intent
(FRD §2.5 NG-01/03/05, §8; TRD §10.6). Fraud detection and AML need different
evidence and units. The current Lab trains a per-transaction FRAUD-unit model;
that storage-unit name is not a prediction that distinguishes fraud from AML.
An AML account/network model remains a later stage in the existing backlog.

No model can distinguish two differently labelled cases with exactly the same
available observations. More synthetic copies of such cases cannot reveal
unobserved authorisation, intent or beneficial ownership. Review must identify
which additional facts actually distinguish the cases and when those facts
became available. Those facts must be present in the data and supported by the
feature implementation before they can influence predictions.

## Input needed from Jevon and the mentor

1. **Target decision:** suspicious and worth investigating, or confirmed fraud/
   money laundering. Define positive/negative/undecided and the evidence needed
   to resolve each. The existing labels measure team judgement on synthetic
   cases; they are not independently confirmed crimes.
2. **Reviewed development cases:** both suspicious scenarios and normal cases
   with similar amounts, velocity, new devices, dormant activity and account
   flows. Include normal salary, business settlements, own-account transfers
   and other relevant legitimate explanations where they fit the use case.
   Avoid designing a channel, identifier, date or missing field that gives away
   the answer. Exact positive counts and acceptance targets are not invented.
3. **Prior observations:** account/entity identifiers, full history and explicit
   history-coverage dates. The current behavioral feature gate is 30 earlier
   observations and 30 observed days; these are existing implementation
   constants, not production acceptance criteria. Dormancy and AML windows also
   need the earlier observations required by their pattern definition. Absence
   of supplied history does not prove inactivity.
4. **Prediction-time context:** transaction and source/destination account/entity
   references; time and time zone; amount, currency and direction; channel and
   type; device/session references; merchant/business context; and verified
   own-account/established-recipient relationships when available. AML requires
   connected incoming/outgoing flows over time. Additional fields are a data
   requirement proposal: the current Lab does not consume all of them yet.
5. **Review provenance:** case/episode reference, pattern, status, decision,
   reviewer reference, review time and evidence references. Record disagreements
   and their resolution. Keep reviewer narratives and labels out of numerical
   model inputs; do not substitute future investigation findings for facts
   available at scoring time.
6. **Operational acceptance:** agree precision/recall by pattern and important
   segment, false positives, missed losses, alert-review capacity and detection
   delay. Scores are not calibrated fraud probabilities. Freeze the candidate
   and threshold using development validation before opening an independent
   later final set; a previously exposed final is not a fresh test.

For this capstone use synthetic, nonidentifying cases. FRD NG-04 prohibits real
personal/bank extracts. A bank pilot with authorised data is a separate scope
decision and environment; this work does not ask for real customer data.
Generator 1.4.0 and shared Tiny/Small data remain subject to AGENTS.md approval.

## Label contract implemented

- Mapping now supports `positive_values` and explicit `negative_values`.
  Unmapped nonblank values cause an error instead of silently becoming normal.
- An omitted negative set is accepted only for exact existing binary pairs:
  `1/0`, `true/false`, `yes/no`, `y/n`, `t/f`, `ya/tidak`, in either explicitly
  selected direction. Custom labels need both sets. These are compatibility
  rules, not a new definition of financial crime.
- Blank/native missing labels are excluded from training/evaluation targets.
  Pending/unknown/unresolved statuses cannot be negative labels. Keep status in
  a separate column and leave the target blank until review is resolved.
  A deliberately selected `REVIEW` positive may represent a review-worthy
  target; it does not establish confirmed fraud.
- Monitoring ignores label/category values. Existing saved model scores and
  frozen mapping JSON are not rewritten. Changed source code intentionally
  prevents an old sealed experiment from being continued under changed code;
  use its original source revision for reproduction and do not rebase hashes.
- Blank-labelled observations are retained as history in the readiness audit.
  Existing training still excludes them before constructing its feature frame;
  the audit explicitly reports its different population and does not claim to
  reproduce that training split.

This is our implementation safeguard, not literal `negative_values` wording in
the FRD. It supports FR-102 validation and avoids corrupting the reference
target used for TRD §10.6 evaluation. Model version/score provenance remains
subject to FR-405.

## Inference safeguards implemented

Every observation must receive exactly one finite score before flags are
compared with the threshold. A NaN score is a prediction failure, not a normal
transaction. A nonfinite threshold or missing/truncated feature contributions
also fails visibly before that model's score inserts. Lab artifact validation
checks the feature registry and Logistic Regression parameter shape, finite
values and positive scales. Lab thresholds must be within the existing score
scale of zero to one. Legacy finite score scales are preserved without clipping.

These guards preserve valid predictions. They do not improve the trained
decision boundary, calibrate probabilities, suppress accounts with little
history or establish new precision/recall results. Small model fits executed by
application regression tests are test fixtures, not a new research experiment.

## Incremental ML alert evidence

Later uploads on the same source day previously hit an existing ML group key
and skipped its new flagged transactions. An OPEN alert without a linked case
now retains the new score IDs/transaction links, a preserved creation snapshot,
the strongest current stored score and audited suppression occurrences
(FR-308/310). Repeating the same observations adds no alert or evidence links;
duplicate counts and audit events may advance. Previously reviewed or case-linked
alerts are protected: genuinely uncovered scores produce a related new finding
instead of editing a human's existing evidence.

This preserves the existing AS-15 day/week grouping. It does not complete the
global transaction-set-hash deduplication/concurrency design, reinterpret old
scores or endlessly reopen a disposed finding from historical scores alone.

## Read-only development-data audit

From `backend/`:

```bash
.venv/bin/python -m app.scripts.audit_ml_readiness \
  --data DEVELOPMENT.csv --mapping mapping.json \
  --train-share 0.7 --out NEW_readiness.json
```

Use the chosen development share explicitly; `0.7` above reproduces the earlier
approved team exercise, not a new universal default. The mapping is the Lab JSON
with an explicit reviewed negative set, for example `"negative_values": ["0"]`
beside `"positive_values": ["1"]`. The CLI reads CSV/Parquet, records input hashes
and refuses to overwrite an existing output. It performs no model fit, scoring,
threshold selection, registry update or DB access.

The audit reports quarantine, duplicate references, chronology, missing history,
and TRAIN-only label/channel/category support. Later partitions disclose only
row/time metadata. Do not point it at an untouched final dataset. Its review
items are descriptive data issues, not pass/fail criteria for bank deployment.

[The existing 615-row source audit](ml/data_readiness_20261117.json) accepts all
615 transactions without quarantine or duplicates. Its 430 TRAIN rows include
46 positives and 384 negatives. **None of these TRAIN rows has the current
minimum historical baseline.** TRAIN AGENT is 5/5 positive, WEB 24/24 positive,
and BANK_TRANSFER 24/24 negative, which are source-shortcut risks to review.
These findings use development data only; no new detection-quality result or
claim of improved precision/recall follows.

## Work still pending

The first safeguards stage does not complete the broader bank-readiness request.
New training and revised features/data need the target, reviewed cases and
acceptance decisions above. Do not activate a candidate merely because its
technical tests pass. The existing product backlog in PROGRESS remains in order:
decision completeness and evidence storage, rule maker-checker, investigation
views, screening/entity resolution, draft reporting, metrics and governance,
followed by the remaining risk/graph scope. Bank integration, secure deployment,
recovery/capacity testing and bank UAT remain separate readiness work.
