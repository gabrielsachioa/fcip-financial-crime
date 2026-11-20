# ML readiness and data needed — 17 November 2026

**Latest implementation, 20 November:** after the research response Jevon says
"oke gas". The optional transaction-context features and limited offline
comparison below are now implemented. They supersede the earlier no-new-features/
training status for this stage only; no model activation or bank-quality claim.

Jevon authorises improvements to the deficiencies identified in the readiness
review, prioritising ML transaction flags. This first implementation hardens
label handling and inference and adds a descriptive development-data audit.
It does not establish new fraud/AML labels, acceptance targets or model quality.
The original operational-target question is in PROJECT_CONTEXT §22; the
20 November response and working interpretation below update its status.

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

**20 November response:** Jevon selects answer `1`, supplies a behavioural
taxonomy/features proposal, directs use of the existing AI-generated dummy data
prepared for the client, and delegates researching/recommending items 4–6.
We interpret `1` as **suspicious and worth human review**, the first option in
item 1 below. This is the working development interpretation, not independently
confirmed crime labels or a mentor's sign-off. The original requests remain
below for traceability; the decisions following them describe what is now
settled and what evidence remains unavailable.

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

## Working decisions after Jevon's response — 20 November 2026

These are research-backed development recommendations authorised by Jevon's
delegation, not new implemented features, a changed threshold or bank acceptance.
They preserve FRD §2.5's advisory boundary and the existing stage order.

### 1–3. Target, pattern proposal and existing data

- Target: prioritise observations that merit human investigation. A reviewed
  positive means review-worthy in a specified synthetic scenario; a reviewed
  negative means a supported legitimate interpretation in that scenario.
  Unresolved/insufficient-evidence cases stay separate with a blank target.
  An unflagged transaction is not certified legitimate. Existing `is_fraud`
  values and historical target descriptions are not rewritten.
- The supplied structuring/smurfing, probe, noise/warming and fan-out/fan-in
  taxonomy is a feature/design input, not a new reviewed answer key. Patterns
  may overlap. Splitting to satisfy a payment-channel limit does not by itself
  establish evasive intent; routine payments, small residual balances and rapid
  onward transfers also have legitimate explanations. Use observed facts plus
  context rather than asserting purpose from amounts alone.
- Keep existing synthetic client/project sources. Do not regenerate, relabel,
  add invented history or silently substitute a public/real dataset. Preserve
  source hashes and provenance per experiment. Synthetic performance describes
  agreement with those simulated reference decisions, not bank effectiveness.
- Start from the existing tabular candidates (Logistic Regression, LightGBM,
  Isolation Forest); select using development evidence, not a promise that one
  architecture wins. The proposed sequence/GNN and account-network work does
  not change the backlog order or become implemented by this record.
- The proposal's auto-block/challenge action does not apply to FCIP. Rules and
  approved model alerts remain evidence for humans, under existing permissions.

### 4. Prediction-time context and feature feasibility

Record the transaction/account identifiers, exact source time and its precision/
zone, amount/currency/direction, channel/type, available counterparty, device and
business context. Keep when each fact became available; late investigation
findings may inform labels but cannot be retroactively used as scoring inputs.
An absent field/history is unknown, not zero, normality or account inactivity.

The latest 615-row source has `counterparty_ref`, `merchant_category` and device
references, but its saved Lab mapping/feature groups do not consume counterparty
identity or merchant category. That CSV has no before/after balance columns.
Its TRAIN-only readiness audit finds 0/430 rows meet the existing historical
baseline gate (30 earlier observations over 30 observed days). These are
specific source/implementation limitations, not claims about every project
dataset. The feature policy should distinguish:

| Proposed feature family | Preconditions and interpretation |
|---|---|
| Counts/value windows, observed amount shape | Exact times for intraday windows; explicit currency/direction. Existing 1h/24h counts/value features are a starting point, not every proposed window. |
| Account-relative amounts, new recipients, probe sequences | Adequate earlier observations, meaningful stable recipient IDs and order. Same-time rows need a documented order; no ordering by arbitrary IDs. The example IDR50,000 cutoff is not adopted as a fraud definition. |
| Pass-through, dwell time, fan-out/fan-in and cycles | Linked incoming/outgoing counterparties, available edges and time order; reconcile mirrored transfers to avoid double counting. Window totals/nearest outgoing payments do not prove which incoming funds financed an outgoing transfer. |
| Before/after balance or residual balance ratio | Verified balance semantics and snapshots; do not reconstruct from an unspecified balance or fabricate missing values. |
| Noise/warming and legitimate business context | Supported transaction purpose/merchant context and history. Small routine payments are observations, not evidence of concealment. |

All temporal/graph queries must stop at scoring time. A later consolidation can
support a later alert, never a feature backdated to the initial transfer. Do not
mix currency amounts, assume bank identity from an account ID, or infer payment
rails/ownership from merchant names. Proposed 5m/4h/etc. windows are candidate
design parameters; any implemented choice needs explicit recorded validation.

### 5. Review provenance and reference-label rubric

For future review records, retain a case/episode ID, linked transaction IDs,
observed pattern(s), reviewer reference/time, decision, evidence, legitimate
alternative explanations and unresolved questions. Use human-facing decisions
`PERLU_DITINJAU`, `WAJAR_DENGAN_BUKTI` and `BUKTI_BELUM_CUKUP`; these are proposed
review categories, not new literal values in the existing binary mapping.
Only resolved decisions can be explicitly mapped to training targets.

Where team reviewers are available, review without seeing model scores or the
generator key, then preserve disagreements and their resolution. If independent
review is unavailable, disclose that instead of inventing reviewer provenance.
Do not make model/rule outputs their own reference truth. Reviewer text, scenario
names, target labels and future findings stay out of model inputs. The supplied
615-row key retains its original, user-reported team-review provenance; this
record does not retroactively make it independently validated.

### 6. Development evaluation and acceptance recommendation

- Retain the mentor-proposed/previously approved chronological 70/15/15 roles:
  TRAIN learns; validation selects features/model/threshold; final evaluates a
  frozen choice. Preserve whole time groups and check episode overlap; the
  existing 615-row exercise has disclosed episode overlap and an already
  exposed final. Repeated runs on it are development comparisons, not a fresh
  blind test. No new final is created by shuffling/re-splitting exposed rows.
- Report AP (Average Precision, with its exact definition, rather than silently
  equating it with trapezoidal PR-AUC), precision, recall, TP/FP/FN/TN, pattern/
  segment support, normal-lookalike errors and alert workload. Explain precision
  as how many flagged cases match the reference; recall as how many reference
  positives are found. Report sample counts/uncertainty; absent pattern support
  is unassessed. Delay/loss-weighted metrics need actual timing/loss reference
  data; leave them unavailable when absent.
- Recommended development comparison: use the same population, labels and
  observation timing as the reference. Prefer a candidate that reduces false
  positives without losing measured recall/covered patterns, or improves recall
  without increasing false positives; expose the tradeoff when neither holds.
  A small point-estimate improvement is not established generalisation. This
  recommendation does not replace the sealed experiments' existing guards.
- No invented 90%/95% bank pass mark, daily analyst capacity or loss cost. There
  is no supplied operational evidence for those values. Show validation tradeoff
  curves and workload relative to the reference instead of silently choosing a
  tolerance. A future numerical acceptance policy requires client/mentor inputs
  and an independent suitable evaluation source.
- Scores remain risk-ranking signals, not percentages of crime probability.
  Any probability calibration needs separate time-respecting held-out evidence
  and checks; no calibration is performed here. No activation follows merely
  from successful technical tests or a synthetic metric.

### Research basis and limits

Sources checked on 20 November 2026. PPATK supplies Indonesian suspicious-
transaction context; foreign guidance supplies methodological examples, not
Indonesian channel limits, reporting thresholds or binding product rules.
The data fields, review categories, model-starting strategy and comparative
development criteria above are our project recommendations, not quoted standards.

- [PPATK: reporting and the TKM definition](https://www.ppatk.go.id/pelaporan/read/50/): deviations from the customer's profile/pattern and suspected reporting avoidance are relevant context.
- [FFIEC: AML red flags](https://bsaaml.ffiec.gov/manual/Appendices/07): a red flag alone is not evidence of crime; legitimate business purpose matters.
- [FINTRAC: financial-entity indicators](https://fintrac-canafe.canada.ca/guidance-directives/transaction-operation/indicators-indicateurs/fin_mltf-eng.php): assess indicators with facts and context.
- [FINTRAC: explaining suspicion](https://fintrac-canafe.canada.ca/guidance-directives/transaction-operation/str-dod/str-dod-eng): clear factual/contextual rationale supports a review record; FCIP does not transmit such reports.
- [BIS: Project Aurora](https://www.bis.org/project/aurora): network analysis and simulated collaboration inform AML research; real-world proofs of concept remain essential. This does not transfer BIS results to FCIP.
- [scikit-learn: chronological evaluation](https://scikit-learn.org/stable/modules/cross_validation.html), [threshold selection](https://scikit-learn.org/stable/modules/classification_threshold.html), [AP](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.average_precision_score.html) and [calibration](https://scikit-learn.org/stable/modules/calibration.html): methodological references, not bank acceptance numbers.

**Remaining evidence gaps:** the taxonomy is not independent reviewed cases;
missing context/history cannot be supplied by research alone. Existing data can
support further explicitly limited development, but cannot establish unobserved
patterns or independent final/bank performance. Mentor ratification and real
operational tolerance remain distinct from Jevon's development delegation.

## Optional transaction context implemented — 20 November 2026

The Lab offers three additional, initially unchecked groups: **Transaksi
beruntun**, **Hubungan lawan transaksi**, and **Dana masuk dan keluar**. They add
11 observations: 5-minute count, 1-hour total amount, known 24-hour channel/
counterparty diversity and counterparty coverage, prior same-counterparty count/
amount jump, four-hour incoming/outgoing totals and their ratio, and elapsed
seconds since an earlier incoming transaction. These are source-clock research
windows from Jevon's proposal, not regulatory or fraud thresholds.

Counterparty mapping preserves stable source identifiers through training and
monitoring. Native missing mapped cells remain empty rather than becoming literal
`None`/`nan`/`<NA>` identifiers. The flow group refuses a Lab mapping that supplied
only default DEBIT direction. Equal-time peers have no invented order. Day-only
observations produce no intraday context; already available date-only history
makes potentially overlapping windows unknown. Account/currency boundaries and
the base historical-baseline policy are preserved. Plain Indonesian factor
explanations distinguish observations from proof of laundering or a probe.

Base `behavioral_v1` names/values stay unchanged without the extension. New
candidates seal `transaction_context_version: transaction_context_v1` in their
hashed vocabulary. Artifact validation permits new features only with that
recognised marker; serving reconstructs the same extension. Lab snapshots hash
the new module. Saved old models keep their arithmetic; in-progress old sealed
runs cannot continue final evaluation under changed code. No hash is rebased.

### Measured development comparison

The checksum-pinned 615-row source is unchanged. The DB-free command
`app.scripts.compare_transaction_context` predeclares four variants with three
native candidates each. All use chronological 430 TRAIN / 92 validation / 93
excluded final rows, TRAIN-only vocabulary, highest validation AP for model
choice and native validation max-F1 thresholds. An extra validation diagnostic
finds the least-FP threshold retaining the reference's total/per-pattern catches;
it does not change native Lab policy. The known/exposed final is **not scored
again**, and is not an independent test.

| Variant (LightGBM selected in each) | Validation AP | TP / FP / FN / TN | Precision / recall |
|---|---:|---|---|
| Existing groups | 0.966667 | 11 / 0 / 1 / 80 | 100% / 91.67% |
| Existing + context | 0.966667 | 11 / 0 / 1 / 80 | 100% / 91.67% |
| Existing without channel-frequency features | 0.946078 | 11 / 0 / 1 / 80 | 100% / 91.67% |
| Context without channel-frequency features | 0.956667 | 11 / 0 / 1 / 80 | 100% / 91.67% |

Both context comparisons retain catches/FP but **do not strictly improve them**.
The small AP increase without channel-frequency features is a ranking finding,
not improved operational detection or evidence of generalisation. Every variant
catches ATO 4/5 and VELOCITY 7/7 on validation; other patterns are unassessed there.
Precision 100% rests on only 11 flags. The counterparty amount-jump feature is
entirely missing in TRAIN and excluded by the existing unusable-feature filter;
this source cannot train that proposed probe indicator. Context otherwise adds
10 usable observations (19→29 features). Sparse baseline history, timing/recipe
shortcuts, review provenance and missing balances/ownership remain limitations.
These validation results are not compared to the earlier 93-row TEST as though
they were the same population.

All artifacts remain **OFFLINE_DRAFT**, without registration or activation.
Original data/labels, generator, shared Tiny/Small and live DB are untouched.
Multi-hop graph/sequence models, matched-funds tracing, new reviewed examples,
calibration and operational/bank acceptance remain pending in the existing order.

[Results](ml/transaction_context_20261120_results.json),
[mapping](ml/transaction_context_20261120_mapping.json) and
[replay verification](ml/transaction_context_20261120_verification.json) retain
provenance. All 12 artifacts pass content validation and reproduce native
validation confusion matrices with finite scores/contributions, without refits,
TEST predictions or DB access. A separate simple causal oracle agrees on1,980
feature values across180 in-memory fixture rows. All1,071 backend tests (including
5 slow),15 explanation tests and frontend build pass. The private PostgreSQL
test cluster stops cleanly. [Technical checks](ml/transaction_context_20261120_checks.json)
retain final full-suite evidence and428 warnings; finite saved parameters/
outputs are checked explicitly. No new browser QA or large-context capacity
claim follows from these tests.

Reproduce from `backend/` with matching source/code and a **new output directory**:

```bash
.venv/bin/python -m app.scripts.compare_transaction_context \
  --data ml_data/team_review_s20261110/training_labeled.csv \
  --mapping ../docs/ml/transaction_context_20261120_mapping.json \
  --expected-sha256 d2b8087e9fc07a2462d84bb1d3fb3be405035b8027430a670b1753e6f220aea6 \
  --train-share 0.7 --out ml_models/NEW_context_comparison
```

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
The 20 November response supplies a working review-worthy target and delegates
development recommendations; it does not supply the missing reviewed/contextual
evidence or independent final data. Future training must state those limitations
and pin its source and evaluation protocol. Do not activate a candidate merely because its
technical tests pass. The existing product backlog in PROGRESS remains in order:
decision completeness and evidence storage, rule maker-checker, investigation
views, screening/entity resolution, draft reporting, metrics and governance,
followed by the remaining risk/graph scope. Bank integration, secure deployment,
recovery/capacity testing and bank UAT remain separate readiness work.
