# FCIP Clear — interface design system

Updated 17 November 2026. Jevon explicitly requests a fresh redesign for people
without technical knowledge, using `ui-ux-pro-max`. AS-26 supersedes the visual
and short-copy choices in AS-21–24. The ML/data work remains separate.

## Product direction

An Indonesian task-based workspace that helps a first-time user understand:
what is available, what needs attention, why a finding appeared, and what to do
next. Use plain language before technical names, observed facts before model
mathematics, and relevant help beside the decision. Do not require an onboarding
tour, dismissible legal notice or external terminology lookup to use the app.

Verified skill search `banking compliance dashboard` returned Minimalism & Swiss
Style: whitespace, clear hierarchy, high contrast and restrained motion suit this
workspace. Its sales-landing-page composition and premium gold palette were not
adopted. The earlier generic search matched wellness styling and was rejected.
Focused searches and the skill's forms guidance support visible labels, recovery
steps and optional details. The local React 18 stack keeps its existing hooks and
dependencies; no React 19-only APIs or external font packages are introduced.

## Information architecture

| Label | Route | User's task |
| --- | --- | --- |
| Beranda | `/` | View data, add transactions, run a deliberate check |
| Perlu ditinjau | `/alerts` | Understand and record a human review |
| Detail peninjauan | `/alerts/:id` | Why flagged, observed evidence, next action |
| Pemeriksaan lanjutan | `/cases/:id` | Follow the case and linked findings |
| Hasil otomatis | `/model-flags` | Read stored transaction/weekly model results |
| Atur deteksi | `/lab` | Prepare/test or approve/use an automatic model |
| Riwayat aktivitas | `/audit` | Trace recorded actions and export the log |
| Panduan | `/guide` | Learn the three-step workflow; search definitions |
| Masuk ke ruang kerja | `/login` | Understand the purpose, then sign in |

Daily work and configuration have separate navigation groups. Existing routes,
API payloads, permissions and recorded statuses are retained; labels translate
their meaning. A valid alert-status URL filter is honoured, including shortcuts
from the home summary. Keep the original state/code available in technical detail.

## Visual foundation

`frontend/src/tokens.css` is the colour/type/spacing source of truth. `index.css`
defines shared controls, cards, tables, login and navigation. Feature styles
`review.css`, `analysis.css`, `lab.css`, `operations.css` and `guide.css` consume
these tokens. Existing `--blue` names alias the primary colour.

| Role | Treatment |
| --- | --- |
| Canvas | Pale blue-grey `#f5f7fc`, white content surfaces |
| Primary | Cobalt `#3159ce`, white label, darker hover |
| Navigation | Ink navy `#152a4e`, pale labels, cobalt selected route |
| Text | Navy `#182b4c`, secondary `#435470`, muted `#63718a` |
| Guidance | Pale blue panels, a short title and useful next action |
| Pending | Amber label and explicit status; never colour alone |
| Success / failure | Green / red plus words and recovery information |
| Typography | Local Avenir Next, Segoe UI or system sans; no font requests |
| Surfaces | 12 px controls, 20 px panels, quiet shadows and generous spacing |
| Interaction | Visible focus, labelled SVG icons, CSS 150 ms feedback |

Values, radii, breakpoints and spacing are reversible design choices rather than
FRD/TRD numerical requirements. The checked main text/background pairs meet 4.5:1
contrast, following the skill's accessibility guidance. This check does not
constitute a complete accessibility certification.

## Explain findings faithfully

`explanations.ts` is a deterministic presentation layer over actual stored values.
It does not change feature computation, inference, thresholds or reference labels.

- First explain the pattern in Indonesian and show observed amounts/counts/time.
- For an ML alert, surface stored indicators with the score/cutoff, then allow
  reading the complete model result before the transaction table.
- Explain what to check; never invent a normal baseline, authorisation, intent,
  device owner, country meaning or missing currency. Unknown information stays
  explicitly unavailable. Retain exact source values in technical disclosures.
- Score is a model value, not fraud probability. Contribution is an explanation
  of arithmetic, not evidence of causation. Unit FRAUD/AML describes the model's
  observation unit, not a classification that a crime occurred.
- An alert and a stored model flag are different. Model flags can remain stored
  without new alerts when the relevant alert switch is off.
- Unflagged/empty data is not proof of safety. Active/approved is not proof of
  accuracy. A completed upload can still have quarantined records.
- Keep close scores and cutoffs visibly distinct; tiny cutoffs must not round to
  apparent zero. Numeric display is localised; original numbers are unchanged.

All required bilingual signal and demonstration captions remain visible, including
with model metrics and review evidence (FR-406/BR-406.1, TRD §10.6, FRD L-01).
The original rule description and detection reason remain available verbatim.
Do not hide evaluation locks, errors, required fields or approval consequences.

## Page behaviour

Home uses a clear primary review action, explained counts and a three-step path.
The data area separates stored transactions, upload/check, and records requiring
repair. Switching views retains the file and metadata; ingesting does not secretly
run detection. Optional source/date/count metadata uses a native disclosure.

Review uses observed-fact cards, contextual questions, linked transactions and a
separate decision area. Keep the minimum 20-character reason and existing role
restrictions. Model explanations precede transactions on ML findings; rule
findings show rule evidence first. Radio choices align the control and its label.

Lab separates prepare/test from approve/use, retaining mounted form state. Model
status explains the next permitted step. Desktop shows seven steps; mobile shows
the current step with an optional full list. Only one version is exposed to
assistive technology at a time. Required label choices, immutable evaluation
mapping/share and final-selection boundaries remain enforced by the existing API.

Audit uses readable activity entries with advanced trace IDs available on demand.
Keep filters, pagination, original reasons and CSV export. Guide has an always
available search over plain definitions, including precision/recall, baseline,
alert/flag, source formats and human decisions.

## Responsive and accessible behaviour

Check 320/375/768/1024/1440 px and landscape. Use minimum-zero grid columns and
shrinkable children so tables scroll inside their own region rather than pushing
the document wide. Native tables preserve all evidence fields. Mobile controls
wrap; inputs retain 16 px text. Panel/help text must remain readable when enlarged.

At ≤1000 px, navigation becomes a keyboard-operable drawer: focus stays inside,
Escape/backdrop restore focus, the main workspace is inert while open, and body
scroll is restored after closing. A skip link and route-change focus support
keyboard users. No fake notifications, decorative charts, external assets or
mandatory guided overlays. Respect `prefers-reduced-motion`.

## Verification

`frontend/tests/README.md` documents the explanation tests, production build and
fully mocked browser runner. Browser QA uses a dedicated headless Chrome profile,
a reserved API hostname and interception of all requests before navigation.
No upload, detection, model or review request reaches a live service. Screenshots
and their visible counts/metrics are fictitious QA examples, not project results.
Evidence and limitations are recorded in PROGRESS and PROJECT_CONTEXT §24.
