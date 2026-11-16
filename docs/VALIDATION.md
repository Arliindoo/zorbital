# Validation

Validation of the current prototype, including historical measurements and the repository
reorganization checks below, recorded on 2026-11-15. These cover the dashboard, imports and replay,
not the full [product vision](PRODUCT-VISION.md). Historical real-data and model-call measurements
were not rerun during the reorganization.

## Repository reorganization checks (Windows)

Work proceeded in stages: environment and baseline, backend boundaries, frontend feature grouping,
then documentation and final integration checks. Python dependencies were synchronized with
`uv sync --locked`; frontend dependencies were installed with `npm ci`. Lockfiles and the
versioned seed were unchanged.

The initial backend run found five existing Windows failures: proposal files written using the
system encoding but read as UTF-8, and catalog paths containing backslashes. Explicit UTF-8 writes
and POSIX-style catalog paths fixed all five before the structural changes. The first backend
reorganization passed 113 tests with one skip; focused review checks passed 32 tests. Four added
architecture checks enforce backend dependency boundaries and frontend shared-module boundaries.
They also caught two deferred ingestion imports of study workflows; deterministic sheet validation
now lives in `datasets/sheets.py`.

| Final check | Result |
|---|---|
| `python -m pytest -q -rs` | 117 passed, 1 skipped (7-Zip unavailable; archive test) |
| `ruff check src tests` | Passed |
| `npm test` | 48 passed across 7 files |
| `npm run lint` | Passed |
| `npm run build` (includes TypeScript checking) | Passed; emitted asset names/hashes matched the pre-move build |
| FastAPI TestClient with the real bundled seed and production frontend build | Fresh temporary database bootstrapped; 11 API responses, 6 SPA routes and 5 entry assets returned successfully; unknown API route returned 404 |
| `git diff --check` | Passed |

The integration smoke check used a temporary database and did not call a live model provider.
Browser interaction, WebGL rendering on hardware and live model behavior were not revalidated in
this pass. The missing 7-Zip check remains an explicit gap, rather than a passing result.

## Evaluation still required for the product direction

The following are proposed evaluation areas, not checks already performed:

- A user starts and resumes an independent research project without a PSI identifier; versions,
  reviewed interpretations and evidence remain linked to it.
- NASA discovery retrieves relevant, traceable references and distinguishes unavailable data,
  incomplete coverage and service failures from an absence of related research.
- Research assistance grounds factual statements and comparisons in evidence, identifies
  incompatible conditions and source dependencies, and supports the user's own conclusions.
- The simulation agent selects an approach with traceable justification, preserves parameter
  sources and units, identifies unsupported conditions and asks for essential missing inputs.
  Evaluate incorrect model choices, conflicting source values and proposed code adaptations as
  well as successful preparation; a successful execution alone is not scientific validation.
- Each predictive model is evaluated for its defined phenomenon, inputs and domain, with explicit
  separation between data used for adjustment and data used for evaluation, and recorded errors
  and uncertainty as appropriate to the method.
- A supported scenario changes model inputs, records its computation and displays consistent
  outputs in charts and 3D. Unsupported scenarios and insufficient inputs are explained.
- User research remains separate from the distributable reference collection.

Passing replay unit tests or rendering a 3D scene does not establish the scientific validity of
new gravity or pressure scenarios. The model and its evaluation protocol are still undecided.

## With real data and real model calls

| What | How | Result |
|---|---|---|
| Full load from the 19 MB in `dados/` | `/usr/bin/time uv run spaceapps-build` | 2.26 s, 287 MB peak memory; 13 files loaded, 12 documentation, 7 not loaded (derived, covered or without reader), 3 exact duplicates; a second run rewrites zero seed files |
| First start without `dados/` | build from `seed/` | 0.76 s; same tables, counts and views as the load from files |
| Seed contents | search for emails, local paths and credentials | none; 336 KB in 21 Parquet files |
| PSI-117 × CFI match | cross of the real tables | 4 of 4 droplets of the 1 atm table are CFI tests (1206, 1247, 1250, 1251), one with a divergent cool-flame value (0 vs 2.972 mm); 1 of 11 pressure-table points matches an individual test |
| Study submission end to end | PSI-26 test log + documents, analyzed with `claude-sonnet-5.5`, reviewed and approved on screen | 0.0722 ZYT, about 30 s, one attempt; good-quality proposal; 122 rows loaded with file, sheet and line; seed updated |
| Document sheet, first pass | PSI-26 DLD and SRD (12 pages) | 0.0406 ZYT (estimate 0.06); 10 items, 10 quotes found on the cited pages; 4 wrong interpretations caught in review (diluent vs. extinguishing agent, nozzle vs. burner, cameras as emission, a "Shuttle" requirement from 2010) |
| Document sheet, second pass, after the vocabulary and prompt fixes | same documents, "replace" checked | 11 items; nitrogen as extinguishing agent, cameras as "other measurement", requirement items marked "as planned"; one item (nozzle size) still misfiled, to be fixed in a new review |
| Quote checker against the real SRD PDF | literal quote; page off by one; paraphrase; hyphenated line break | found; found; rejected; found |
| Review grid in the browser (no model cost: a local fake gateway) | uncheck an item; change an attribute from the dropdown | both recorded in the draft; counter updated |
| Every page renders (earlier Streamlit front end) | Playwright with local Chrome, light and dark themes | 0 exceptions on FLEX, CFI, study hub, PSI-26, side-by-side sheets, submit, add documents. The React front end that replaced it is covered by its type check, Vitest suite and production build (below) and by the team's manual use during the demo |
| Front end after the React rewrite | `npm ci`, `npm run typecheck`, `npm test`, `npm run build` | type check clean; 7 test files, 48 tests passed in 0.7 s; production build in 0.8 s (main bundle 717 kB, 229 kB gzipped) |
| Assistant failure modes | a non-existent model configured; errors sent inside the stream | clear message with alternative models before any charge |

Not yet done with a real credential: a scripted round of assistant questions (count with a filter,
a question about another investigation, a "which material is safest?" question). The automated
tests cover the mechanics; the quality of the answers was checked informally during development.

## Automated tests

`uv run pytest` — 114 tests, 25 s, no `dados/`, database or credential needed. A synthetic
`dados/` folder mirrors the real layouts (FLEX CSV, BASS-II sheets per investigator, the five CFI
sheets, PSI-117 wide tables and ReadMe, the three PSI-142 block layouts, ISA-Tab metadata). A local
HTTP server replays recorded responses in place of the model gateway; a fixture blocks the real
`.env` so no test can spend tokens (this fixture exists because, before it, four tests did: 0.0029
ZYT).

| File | Tests | What it guards |
|---|---|---|
| `tests/test_ingest.py` | 19 | each investigation in its own table; exact duplicates not loaded; original beats sample; unreadable cells become alerts; BASS material text → categories (8 real strings); measured and model kept apart in views; CFI sheets joined and zeros kept out of measurements; PSI-142 metadata conflicts and swapped columns flagged; portal prefixes recognized; PSI-117 ReadMe says which tables are missing; PSI-117 measurements traced to CFI flights |
| `tests/test_seed.py` | 4 | export is stable when data does not change; round trip rebuilds tables and views; no local paths in the seed; the app builds the database from the seed on first open |
| `tests/test_api.py` | 17 | the API: health; overview; each page payload with typed tables; investigation with sheet, links and metadata; studies hub with search index; generic study page; side-by-side comparison; explore sources; the assistant endpoint streams NDJSON and refuses unknown pages |
| `tests/test_uploads_api.py` | 5 | submission over HTTP: receive, analyze with the fake gateway, save the review, approve, delete; the documents flow |
| `tests/test_assistant.py` | 23 | every page uses known groups and ≤ 10 tools; tools from another page refused; unknown parameters refused; quality tools locked to the page's investigation; cross-study tools only on comparison pages; history trimmed at user boundaries; unusable model refused before spending; gateway error codes and mid-stream errors become messages; a full tool round trip with the real SDK against a local server; each tool returns what it promises |
| `tests/test_studies.py` | 19 | archives: escaping paths, links, size limits, `.rar` via 7z; receive, classify, nested archives, junk skipped, document required, invalid PSI; profile finds the header below title rows; validation blocks unconfirmed inferences and unmapped columns; the generic reader keeps provenance and records alerts; the proposal is validated and corrected by the model (two attempts); approval writes the spec and loads the study; catalog studies and existing folders refused; pages render; hub search and filters |
| `tests/test_ficha.py` | 17 | unit conversion and varied/fixed; natural levels; linked conditions found and excluded correctly; sheet written with evidence; submitted studies use their declared attributes; unknown units isolated; hub filters by range; side-by-side verdicts, table, same-hardware warning; the comparison tool locked to the studies on screen; PSI metadata without people; metadata feeds search and the study page |
| `tests/test_ficha_docs.py` | 10 | quotes checked against page text; wrong page, short quote and escaping paths do not verify; a reviewer's decision survives a re-check; the full propose → check → approve → load path; invalid sheet files not loaded; the submission proposal carries the checked sheet; the review grid merge; the add-documents page; extinguishing agent and "as planned" items |
| `frontend/src/**/*.test.ts` (Vitest) | 48 in 7 files | explore helpers; data i18n; review grid logic; studies hub search and filters; droplet burn replay (d² law between measured ends); scene model; per-study simulation bindings |

Lint and formatting: `uv run ruff check .` and `uv run ruff format .` (Python), `npm run lint`
(oxlint) and `npm run typecheck` (TypeScript), clean.

## Test review

The automated tests were written alongside the code with AI assistance and are read by the team
area by area; this table records the review date of each area.

| Area | Files | Reviewed on |
|---|---|---|
| Load and seed | `test_ingest.py`, `test_seed.py` | |
| Assistant | `test_assistant.py` | |
| Study submission | `test_studies.py` | |
| Fact sheets and comparisons | `test_ficha.py`, `test_ficha_docs.py` | |
| API | `test_api.py`, `test_uploads_api.py` | |
| Front end | `frontend/src/**/*.test.ts` | |

## Open issues

- PSI-26 document sheet: the 3.2 mm nozzles are still filed as "burner size"; fix in a new review
  with "replace".
- All PSI-26 sheet items are marked "as planned" because the SRD is a requirements document; a
  per-document mark would be more useful than a per-item one.
- The Explore page can aggregate across natures (see Architecture, known limitations).
- FLEX is a 34-test sample; four PSI-117 tables have no reader.
- Assistant answer quality and cost per question were not measured systematically.
- The color palette was validated for colorblind separation in its reference source, not re-validated
  in this repository.
