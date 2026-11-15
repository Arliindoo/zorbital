# Space Apps 2026 — submission form texts

Ready-to-paste texts for the project page fields. Keep them in sync with the root README.

## Project Name

Zorbital — fire safety insights from NASA microgravity combustion data

## High-Level Project Summary

Zorbital is an interactive dashboard that brings NASA's public microgravity combustion experiments
(PSI repository) into one place: normalized, comparable tables with the provenance of every number,
a fact sheet per experiment (fuels, samples, conditions, what varied, what was measured), rule-based
comparisons between studies, and an AI assistant that only speaks from the data on screen. It
addresses the challenge directly — making decades of flame-in-microgravity results findable,
comparable and understandable for Moon and Mars fire safety — while making sure the screen never
invites a wrong conclusion: measurement and simulation are never mixed, each experiment carries its
"what not to conclude" cautions, and every AI output is a proposal validated by code and approved by
a person.

## Link to Final Project

https://github.com/Arliindoo/zorbital

## Project Demo

<!-- link público do vídeo (≤ 30 s) ou dos slides (≤ 7), em inglês ou com legendas em inglês -->

## Detailed Project Description

**What it does.** Zorbital loads six NASA PSI investigations on combustion in microgravity — FLEX
(PSI-69), CFI (PSI-39), PSI-117, BASS-II (PSI-25), PSI-142 and BASS (PSI-26) — and turns their
heterogeneous spreadsheets into typed, comparable tables. For each investigation it shows the
question the data answers, where the data came from and whether it is complete, quality alerts for
every cell that could not be read as-is, and the cautions that the reports attach to the numbers.
A computed fact sheet summarizes fuels, sample shape and size, test conditions in common units,
what was measured, what varied between tests and what stayed fixed, and which conditions varied
together and therefore cannot be separated. Two comparison pages cross investigations with explicit
rules: PSI-117 × CFI, with a point-by-point match showing that the "measurements" of the ground
model study are CFI flights (so it is not an independent validation), and side-by-side fact sheets,
which tell for two to four studies where their ranges overlap and give a verdict per pair. An
assistant on every page explains what is on screen. New studies can be added through a guided
submission flow.

**How it works.** A deterministic load (`spaceapps-build`) reads the original PSI files, detects
duplicates by content hash, preserves types, extracts categories from free text next to the
original text, keeps measurement, model and uncertainty as separate rows, records every unreadable
cell as an alert with its original value, computes the fact sheets, and builds a DuckDB database.
The database's tables are versioned as a small Parquet seed, so anyone who clones the repository
opens the dashboard with all the data and no downloads. A FastAPI API serves each page's tables in
one call; the React front end runs filters, charts and counts in the browser. Each study also has a
3D simulation view (hand-written WebGL2) that descends from the ISS or the laboratory to the
experiment and replays the chosen test from the source values, marking on screen what is data and
what is illustration, and showing "no reconstruction" when the data is missing. The language model is used in three contained ways: (1) the assistant is a
tool-using agent whose tools are fixed queries with closed parameters, enabled per page and enforced
in code, so it cannot run SQL, read files or cross investigations outside the comparison pages;
(2) when a new study is submitted, the model receives a profile of the spreadsheets and the text of
the documents and proposes a reading specification — what each column is, its unit, its nature,
special values, cautions — with the evidence for every interpretation; deterministic code validates
it, a person reviews and confirms every inference, and from then on code applies the specification
on every load; (3) for a study's documents, the model proposes objective, sensors and fixed
conditions with page and verbatim quote, code checks that the quote exists on that page, and a
reviewer decides what enters. The model never writes to the database.

**Benefits.** Researchers and engineers get the PSI combustion results in one place, already
normalized, with provenance and cautions attached, and a way to ask "can these two studies be
compared?" and get an answer based on their actual conditions. Readers get an assistant that cannot
hallucinate numbers, because every number comes from a query it shows. Maintainers can add
investigations without writing a parser for each one.

**What we hope to achieve.** A reference way of presenting experimental physical-science data to
people who need to act on it: separating kinds of evidence, keeping provenance, stating limits, and
using AI as a proposer under human review rather than as an oracle.

**Tools, languages and software.** Server: Python 3.12 (uv), FastAPI and uvicorn, Polars, DuckDB,
Apache Parquet (pyarrow), openpyxl, pypdf, python-dotenv, python-multipart, the openai Python SDK as
the client for an OpenAI-compatible model gateway (Zyria) routing to Anthropic Claude models, pytest,
httpx and ruff, 7-Zip for `.rar` uploads. Front end: Node.js 22, React 19, Vite, TypeScript,
TanStack Query, React Router, react-markdown, Motion, Vitest and oxlint; charts in hand-drawn SVG
and the simulation in hand-written WebGL2, with no charting or 3D library. 114 Python tests and 7
front-end test files run without data, database or AI credential.

## NASA Data

Physical Sciences Informatics (PSI) repository — all data downloaded manually from each
investigation's page and loaded unchanged:

- PSI-69 FLEX, Flame Extinguishment Experiment (DOI 10.60555/mbq8-0451): droplet extinction tests
  on the ISS — conditions (O₂, pressure, droplet size) and outcomes.
- PSI-39 CFI, Cool Flames Investigation: data summary spreadsheet (227 tests) — conditions, hot and
  cool flame extinction diameters, burning rates, cameras and operator comments.
- PSI-117: hot and cool flame extinction of n-dodecane droplets — measured and modeled extinction
  diameter by pressure, extinction at 1 atm for three alkanes, numerical model time series, and the
  investigation's ReadMe listing its tables.
- PSI-25 BASS-II, Burning and Suppression of Solids II (DOI 10.60555/4qc4-de67): test matrix
  (129 tests) — materials, geometries, O₂, ventilation, gas measurements.
- PSI-142: cool-flame extinction limits in counterflow (Princeton) — points digitized from eight
  published figures, with their descriptions and DOIs.
- PSI-26 BASS, Burning and Suppression of Solids: experimental table (test log) and the DLD and SRD
  documents, added through the dashboard's own study-submission flow.
- PSI investigation metadata (ISA-Tab bulk download) for 25 investigations: objective, hypothesis,
  approach, hardware, period and publications. Researchers' personal data was deliberately not
  loaded.

NASA Technical Reports Server: FLEX report (NTRS 20150023456) and BASS-II summary report (NTRS
20210011385), used as references for the cautions.

## Space Agency Partner Data & Other References

No space-agency-partner data was used. Other references, code and tools:

- Server: Python 3.12 with uv (https://docs.astral.sh/uv/); FastAPI (https://fastapi.tiangolo.com/);
  uvicorn; Polars (https://pola.rs/); DuckDB (https://duckdb.org/); Apache Parquet via pyarrow;
  openpyxl (https://openpyxl.readthedocs.io/); pypdf (https://pypdf.readthedocs.io/); python-dotenv;
  python-multipart; openai Python SDK (https://github.com/openai/openai-python); pytest; httpx; ruff;
  7-Zip.
- Front end: Node.js 22; React (https://react.dev/); Vite (https://vite.dev/); TypeScript; TanStack
  Query (https://tanstack.com/query); React Router; react-markdown with remark-gfm; Motion
  (https://motion.dev/); Vitest; oxlint; fonts Sora and Geist Mono via Fontsource; Solar icons
  generated with better-icons.
- Zyria (https://zyria.ai), an OpenAI-compatible model gateway, routing to Anthropic Claude models.
- Third-party tabular copies of PSI data (https://github.com/AnteurAbderraouf/Fotia/tree/main/combustion_science),
  consulted only to select the investigations before downloading from PSI.
- Challenge page: https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/
- All code in the repository is original work of the team (see the AI disclosure below). No NASA
  logos, flags or mission identifiers are used. No images, video or audio were generated by AI.

## Use of Super Intelligence (SI)

Yes, in two distinct ways.

Inside the product: the assistant, the study-submission analysis and the document fact sheet call a
language model (Anthropic Claude through the Zyria gateway). Every output of the model is a
proposal: it is validated by deterministic code and approved by a person before anything is stored,
and the model never writes to the database. The dashboard shows each call and its cost.

Building the product: the idea, the choice of investigations, the download and inspection of the
data, the scientific cautions, every design decision, the end-to-end tests with real data and the
demo are the team's work. The source code was written in pair-programming with an AI coding
assistant (Anthropic Claude), directed, reviewed and tested by the team. The README and the
documentation were drafted the same way and revised by the team. This is disclosed in the
repository's README. No images, video or audio were generated by AI.
