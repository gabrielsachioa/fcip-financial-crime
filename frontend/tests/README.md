# Frontend regression checks

Run the pure explanation tests and production build from `frontend/`:

```bash
npm run test:explanations
npm run build
```

The explanation tests compile only the pure TypeScript helper into a temporary
directory. They check grounded facts, missing context, source currency and
readable score boundaries; they neither train nor evaluate a model.

## Isolated browser checks (macOS)

The browser runner expects a dedicated, disposable Chrome profile, Vite on
127.0.0.1:5177 and the reserved API hostname below. It intercepts **every API
request**, including attempted mutations. All responses, counts, model metrics
and identities are invented QA fixtures. They are not application or ML results.
The runner blocks all other external origins and never contacts the app DB.
This runner was verified with Node 24.16.0; it uses Node's global WebSocket API.

In one terminal, start the fixture-only frontend:

```bash
VITE_API_BASE_URL=https://fcip-qa.invalid npm run dev -- --host 127.0.0.1 --port 5177 --strictPort
```

In a second terminal, start Chrome with its own profile (not your usual browser):

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9237 \
  --user-data-dir=/tmp/fcip-redesign-20261117-qa \
  --no-first-run --no-default-browser-check \
  --disable-background-networking about:blank
```

Then, from `frontend/`, run:

```bash
npm run test:ui
```

The runner checks responsive layouts, keyboard drawer navigation, decision
reason requirements, role restrictions, label mapping/locks, retained upload
state, glossary search, visible query errors and the compact mobile stepper.
It writes screenshots and a check ledger to
`docs/screenshots/redesign-20261117/` and closes only the dedicated QA browser on
success. Stop the Vite process when finished. If a check fails, inspect the
dedicated profile or restart it before rerunning; do not point the test at a
personal browser session or a live API.
