# Zorbital — AI-assisted research and simulation

**NASA Space Apps Challenge 2026 · Flame in Freefall**

Zorbital's product direction is a research platform centered on the user's own experiments.
Researchers bring their data, documents and questions; the platform is intended to help them find
related NASA research, connect evidence and explore changes such as gravity or pressure through
predictive simulation and 3D visualization. AI helps investigate and interpret evidence; the
researcher develops the scientific conclusion.

The planned simulation agent helps turn a research question into an executable scenario: it
proposes suitable scientific models, prepares parameters from research data and identified
references, asks for essential missing information and conducts calculations through scientific
tools. Results and their evaluation then feed the comparison views and 3D experience.

**Implementation status:** the current repository provides a local NASA PSI dashboard, reviewed
study imports, comparisons, a page-scoped assistant and 3D reconstructions. Independent research
projects, live NASA discovery, the specialized simulation agent and predictive simulation of
changed conditions are not yet implemented. The six included investigations are the demonstration
and reference collection.

The [product vision](docs/PRODUCT-VISION.md) presents the research journey and the ambition beyond
the current demonstration. The [simulation proposal](docs/SIMULATION.md) details
the first scenario workflow; the [Space Apps presentation draft](docs/SUBMISSION.md) summarizes
the vision and current demonstration in English.

*Também em português: [README.pt-BR.md](README.pt-BR.md).*

## The problem

Researchers need to connect their own experiments with relevant external evidence, understand
similarities and differences, and investigate what may happen under changed conditions. Zorbital
aims to support that journey while keeping evidence and hypotheses distinguishable.

The current prototype addresses part of this problem through NASA combustion data:

- Every investigation published its data differently: one sheet per researcher, pairs of columns
  side by side, categories written as free text (`3/8" clear rod`), units in the header or nowhere.
- Measurement and simulation sit in the same table. A droplet experiment and a solid-material
  experiment answer different questions. Part of the "measurements" of one investigation are the
  flights of another. None of this is flagged in the files.
- Each experiment has known traps that live in the reports, not in the tables: a `0` that means
  "no visible extinction", a fan reading that is not a calibrated velocity.
- A generic AI chatbot answers fluently about numbers that do not exist and happily compares what
  should not be compared.

Fire safety on the Moon and Mars depends on reading these results right. Zorbital is built so that
the screen does not invite the wrong conclusion.

## What the current prototype does

| | |
|---|---|
| **Six investigations, ready to explore** | FLEX (PSI-69), CFI (PSI-39), PSI-117, BASS-II (PSI-25), PSI-142 and BASS (PSI-26), each with the question it answers, the source file, completeness, quality alerts and its *"what not to conclude"* cautions |
| **A fact sheet per study, computed from the data** | fuels, sample shape and size, test conditions (O₂, pressure, helium, flow) in common units, what was measured, what varied between tests and what stayed fixed, and the conditions that varied together and therefore cannot be separated |
| **Fact sheet from documents** | the AI reads the study's PDFs and proposes objective, sensors and fixed conditions, each with page and quote; code checks that the quote exists on that page; a person decides what enters |
| **Comparisons with rules** | PSI-117 × CFI with a point-by-point match (4 of 4 droplets in the 1 atm table are CFI flights, so it is not an independent validation); and *Side-by-side sheets*, which tells for 2–4 studies where ranges overlap and gives a verdict per pair |
| **3D reconstruction for supported studies** | WebGL2 scenes replay source values and reconstructed or estimated segments with explanatory notes. Tests without sufficient supported inputs are blocked. The view does not calculate predictions for user-modified gravity or pressure, and generic uploads do not automatically acquire a 3D model |
| **An assistant per page** | uses fixed queries available on the page and receives the studies' question, evidence type and cautions before answering. It is instructed to identify the basis of numeric claims; generated text has no final factual verifier. Opens with ⌘K |
| **Submitting a new study** | upload tables and a document under a PSI identifier; the AI proposes how to read each column; a person reviews and approves; code loads the study deterministically. This extends the shared local catalog rather than creating an independent research project |

The rule for adopting data interpretations is: **the AI proposes, code validates and applies, a
person reviews and approves.** The assistant is instructed to ground numbers in tool results;
its generated text is not independently verified. Measurements, model outputs and uncertainty
must remain distinguishable; the Explore page has a known aggregation limitation. Current
assistant tools cross investigations only in designated comparison flows. These page limits
describe the prototype, not the intended scope of research assistance.

## How the current prototype works

```
dados/   NASA PSI files, downloaded by hand, never modified (outside git)
   │  spaceapps-build  — deterministic load: no AI, no network
   ├────────────► seed/   normalized tables as Parquet (in git, 336 KB)
   ▼                 │  first run without a database
data/zorbital.duckdb ◄┘   derived (outside git)
   │  read-only
   ▼
FastAPI API (Python) ──JSON──► React front end (filters, charts and tables run in the browser)
   │
   ├── assistant ──► language model (only when someone asks; streamed back as NDJSON)
   └── study submission: AI proposes a reading spec → code validates → person approves → loaded by code
```

Three current uses of a language model, without direct database-writing tools. The planned
simulation agent is an additional capability described in the product vision:

1. **The assistant.** A tool-using agent whose tools are fixed queries with closed parameter lists
   (no SQL, no file paths, no web). Each page enables only its own tool groups, and the scope is
   enforced in code, not in the prompt. Up to 6 tool rounds per question.
2. **The reading-spec proposer.** Receives a profile of the spreadsheets (12 sample rows per sheet)
   and the documents' text, returns a JSON reading specification. A deterministic validator checks
   it and sends the problems back (up to twice). Inferences start unconfirmed and block approval
   until a reviewer confirms them.
3. **The document-sheet proposer.** Returns objective, sensors and fixed conditions with file,
   page and verbatim quote. Code searches the quote in that page's text; unverified items start
   unchecked. Only what the reviewer checks is saved. When a document contradicts the data, the
   sheet shows both and raises an alert; comparisons follow the data.

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DATA.md](docs/DATA.md) ·
[docs/DECISIONS.md](docs/DECISIONS.md) · [docs/VALIDATION.md](docs/VALIDATION.md).

## Repository layout

| Path | What it is |
|---|---|
| `src/spaceapps/api/` | FastAPI: page data (`pages.py`), studies, sheets and search (`studies.py`), study and document submission (`uploads.py`), streaming assistant (`chat.py`), production server (`app.py`) |
| `src/spaceapps/ingest/` | the load: catalog, readers, fact sheets, database, seed |
| `src/spaceapps/studies/` | study submission and document fact sheets |
| `src/spaceapps/assistant/` | the assistant: screen state, tools, loop, gateway client |
| `src/spaceapps/` (`fichas`, `search`, `db`) | side-by-side comparison, search index, read-only database access |
| `frontend/src/pages/` | one page per investigation, overview, studies hub and the generic page of submitted studies, side-by-side sheets, PSI-117 × CFI, submission, documents, explore |
| `frontend/src/sim/` | the WebGL2 simulation: line-drawing engine, scenes, burn replay, per-study data binding, HUD |
| `frontend/src/charts/`, `components/`, `assistant/`, `styles/` | hand-drawn SVG charts and fixed category colors, screen pieces, the assistant panel, the visual system |
| `tests/` | synthetic `dados/` and the Python tests (load, seed, API, assistant, submission, sheets) |
| `seed/` | the normalized tables, as Parquet |

## Run it

Requires [uv](https://docs.astral.sh/uv/) (it installs Python 3.12 and the dependencies) and
Node.js 22 or newer.

Two parts: the **API** in Python (FastAPI, `src/spaceapps/api/`), which reads the database and runs
the assistant, and the **front end** in React + Vite + TypeScript (`frontend/`), which draws the
screen in the browser.

Development, in two terminals:

```bash
uv sync && cp .env.example .env               # then fill in the gateway URL and key (optional)
uv run uvicorn spaceapps.api.app:app --reload # API at http://localhost:8000 (docs at /api/docs)
```

```bash
cd frontend && npm install && npm run dev     # dashboard at http://localhost:5173
```

Production, one process serving the API and the built front end:

```bash
npm --prefix frontend ci && npm --prefix frontend run build
uv run spaceapps-serve                        # http://localhost:8000
```

Nothing to download: on first start the API builds its database from `seed/`. Without an AI
credential everything works except the assistant and the study submission. The interface is in
English by default, with Portuguese available in the settings.

```bash
uv run spaceapps-build               # if you have the original files in dados/: rebuilds database and seed
uv run pytest                        # Python tests: load, API, assistant, submission — no data, database or AI needed
npm --prefix frontend test           # front-end tests (Vitest)
npm --prefix frontend run typecheck  # TypeScript
```

## NASA data and resources used

The bundled reference collection comes from NASA's **Physical Sciences Informatics (PSI)**
repository, downloaded manually and loaded unchanged. What is loaded, how, and each investigation's cautions are in
[docs/DATA.md](docs/DATA.md).

| Investigation | NASA page | Report / DOI |
|---|---|---|
| PSI-69 · FLEX — Flame Extinguishment Experiment | https://psi.nasa.gov/physci/repo/data/investigations/PSI-69 | DOI 10.60555/mbq8-0451 · [NTRS 20150023456](https://ntrs.nasa.gov/citations/20150023456) |
| PSI-39 · CFI — Cool Flames Investigation | https://psi.nasa.gov/physci/repo/data/investigations/PSI-39 | — |
| PSI-117 · Hot and cool flame extinction of n-dodecane droplets (measurement × model) | https://psi.nasa.gov/physci/repo/data/investigations/PSI-117 | — |
| PSI-25 · BASS-II — Burning and Suppression of Solids II | https://psi.nasa.gov/physci/repo/data/investigations/PSI-25 | DOI 10.60555/4qc4-de67 · [NTRS 20210011385](https://ntrs.nasa.gov/citations/20210011385) |
| PSI-142 · Cool-flame extinction in counterflow (digitized figures) | https://psi.nasa.gov/physci/repo/data/investigations/PSI-142 | — |
| PSI-26 · BASS — Burning and Suppression of Solids | https://psi.nasa.gov/physci/repo/data/investigations/PSI-26 | DLD and SRD documents from the PSI page |
| PSI investigation metadata (ISA-Tab bulk download) | https://psi.nasa.gov/ | objective, hypothesis, hardware and publications of 25 investigations; personal data of researchers excluded |

Challenge page: https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/

## Other references, libraries and tools

- **Server (Python 3.12 with [uv](https://docs.astral.sh/uv/)):** [FastAPI](https://fastapi.tiangolo.com/)
  and [uvicorn](https://www.uvicorn.org/) (API); [Polars](https://pola.rs/) (data frames);
  [DuckDB](https://duckdb.org/) (local analytical database); [Apache Parquet](https://parquet.apache.org/)
  via [pyarrow](https://arrow.apache.org/) (seed format); [openpyxl](https://openpyxl.readthedocs.io/)
  (spreadsheets); [pypdf](https://pypdf.readthedocs.io/) (PDF text); [python-dotenv](https://github.com/theskumar/python-dotenv);
  python-multipart (uploads); the [openai](https://github.com/openai/openai-python) Python SDK, used
  as the client for the model gateway; [pytest](https://pytest.org/), [httpx](https://www.python-httpx.org/)
  and [ruff](https://docs.astral.sh/ruff/) for tests and lint; [7-Zip](https://www.7-zip.org/) (`7z`)
  for `.rar` uploads.
- **Front end (Node.js 22):** [React](https://react.dev/) 19, [Vite](https://vite.dev/),
  [TypeScript](https://www.typescriptlang.org/), [TanStack Query](https://tanstack.com/query),
  [React Router](https://reactrouter.com/), [react-markdown](https://github.com/remarkjs/react-markdown)
  with remark-gfm, [Motion](https://motion.dev/); [Vitest](https://vitest.dev/) and
  [oxlint](https://oxc.rs/) for tests and lint; fonts [Sora](https://fonts.google.com/specimen/Sora)
  and [Geist Mono](https://vercel.com/font) via Fontsource; [Solar icons](https://www.figma.com/community/file/1166831539721848736)
  generated with better-icons. Charts are hand-drawn SVG and the simulation is hand-written WebGL2;
  no charting or 3D library.
- **Language-model gateway:** [Zyria](https://zyria.ai) (OpenAI-compatible API) routing to
  Anthropic Claude models (`claude-sonnet-5.5` by default). Paid per token; the dashboard shows the
  cost before and after each call.
- **Third-party tabular copies** used only to pick the investigations before downloading from PSI:
  https://github.com/AnteurAbderraouf/Fotia/tree/main/combustion_science

No NASA logos, flags or mission identifiers are used anywhere in the project. No images, video or
audio were generated by AI.

## Use of AI (Super Intelligence) — disclosure

AI was used in two distinct ways, and we want to be precise about both.

**Inside the current prototype.** The assistant, the study-submission analysis and the document
fact sheet call a language model through the Zyria gateway. Reading specifications and document
sheets go through code checks and human review before adoption. Assistant replies are generated
text subject to instructions and tool restrictions, without a final factual verifier or formal
human approval step. The model has no direct database-writing tool. Calls and costs are disclosed.

**Building the product.** The product direction and research goals come from the team. Earlier
implementation and documentation used an AI coding assistant (Anthropic Claude) under the team's
direction. The current product vision, simulation proposal and presentation text were organized
with OpenAI Codex. Implemented behavior, recorded checks and remaining review work are documented
separately in [docs/VALIDATION.md](docs/VALIDATION.md); proposed capabilities do not imply completed
implementation or scientific validation.

## Team

| Member | Role |
|---|---|
| Ernesto Mendanha | Full-stack developer · data structuring · presenter |
| Alexandre Neves | Full-stack developer · backend · data sourcing |
| Maria Eduarda de Sá | Front-end developer |
| Eduardo Luiz | Design · front-end |
| Arlindo Antonio | Software engineer · pitch structure · documentation · project-level decisions |

## License

Code and documentation: [MIT](LICENSE). The data in `seed/` is derived from NASA PSI and follows
NASA's data usage terms.

## What this project does not claim

The current prototype shows evidence and reconstructs recorded experiments; predictive simulation
of modified conditions is a product objective awaiting model selection and scientific evaluation.
It does not provide operational safety advice and has no affiliation with or endorsement from NASA.
The list of what the bundled data can and cannot support is in
[docs/DATA.md](docs/DATA.md#what-the-data-can-and-cannot-support).
