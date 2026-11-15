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

The form asks six questions; each answer below is ready to paste under its heading.

### What does it do or how does it work?

Zorbital brings NASA's public microgravity combustion experiments (the PSI repository) into one
place and makes them comparable without letting the screen invite a wrong conclusion. It loads six
investigations — FLEX (PSI-69), CFI (PSI-39), PSI-117, BASS-II (PSI-25), PSI-142 and BASS (PSI-26)
— through a deterministic pipeline that detects duplicate files by content hash, preserves types,
extracts categories from free text next to the original text, keeps measurement, model and
uncertainty as separate rows, and records every cell it cannot read as an alert with the original
value instead of guessing. The result is a local DuckDB database whose tables are versioned as a
small Parquet seed, so anyone who clones the repository opens the dashboard with all the data.

On top of it: one page per investigation with its own filters and charts, the question the data
answers, the source and completeness, and the "what not to conclude" cautions from the reports; a
fact sheet per study computed from the data (fuels, sample shape and size, conditions in common
units, what was measured, what varied and what stayed fixed, and which conditions varied together
and therefore cannot be separated); a 3D simulation view that descends from the ISS or the
laboratory to the experiment and replays the chosen test from the source values, marking on screen
what is data and what is illustration; two comparison pages with explicit rules (PSI-117 × CFI with
a point-by-point match, and side-by-side fact sheets with a verdict per pair); and an AI assistant
on every page.

The language model is used in three contained ways. The assistant is a tool-using agent whose tools
are fixed queries with closed parameters, enabled per page and enforced in code, so it cannot run
SQL, read files or cross investigations outside the comparison pages; before any query it reads the
fact sheets of the studies involved, and every number it cites comes from a query it shows. When a
new study is submitted, the model receives a profile of the spreadsheets and the text of the
documents and proposes a reading specification with the evidence for every interpretation; code
validates it, a person confirms every inference, and from then on code applies the specification on
every load. For a study's documents, the model proposes objective, sensors and fixed conditions with
page and verbatim quote; code checks that the quote exists on that page; a reviewer decides what
enters. The model never writes to the database. A FastAPI API serves each page's tables in one call
and the React front end runs filters, charts and counts in the browser.

### What benefits does it offer?

Researchers and fire-safety engineers get decades of PSI combustion results already normalized,
with the provenance of every number and the cautions attached, and an answer to "can these two
studies be compared?" based on their actual conditions rather than on intuition. Readers get an
assistant that cannot hallucinate numbers and that states the basis of each one (filtered rows or
whole table, sample or complete data). Curators get a way to add investigations without writing a
parser for each: the AI proposes, the person reviews, the code applies. Anyone can run it offline
with no downloads, and the whole chain from source file to pixel is reproducible.

### What is the intended impact of the project?

Fire is one of the risks that scale badly on long missions, and the knowledge needed to design for
it exists but is scattered across incompatible files and reports. The intended impact is to make
that knowledge usable with its limits intact: to shorten the path from "NASA has tested this" to
"here is what the tests show, under which conditions, and what they do not show", for the people
preparing Moon and Mars habitats. Beyond combustion, the project is a template for presenting
experimental physical-science data with AI in the loop: evidence types kept apart, provenance kept,
limits stated, and the model used as a proposer under human review rather than as an oracle.

### What tools, coding languages, hardware, or software did you use to develop your project?

Server: Python 3.12 managed with uv; FastAPI and uvicorn; Polars; DuckDB; Apache Parquet via
pyarrow; openpyxl (spreadsheets); pypdf (PDF text); python-dotenv; python-multipart; the openai
Python SDK as the client for an OpenAI-compatible model gateway (Zyria) routing to Anthropic Claude
models; pytest, httpx and ruff; 7-Zip for `.rar` uploads. Front end: Node.js 22, React 19, Vite,
TypeScript, TanStack Query, React Router, react-markdown with remark-gfm, Motion, Vitest and oxlint;
charts in hand-drawn SVG and the simulation in hand-written WebGL2, with no charting or 3D library.
Data: NASA PSI files downloaded by hand and loaded unchanged. No special hardware: it runs on a
laptop. 114 Python tests and 48 front-end tests run without data, database or AI credential. An AI
coding assistant was used in pair-programming to write code and documentation under the team's
direction and review (see the SI disclosure).

### How is your project creative?

Most AI dashboards put the model between the user and the data and hope the prompt keeps it
honest. Zorbital inverts that: the model never touches the data, it only proposes — a query to run,
a way to read a column, a sentence from a report — and deterministic code verifies the proposal
before a person approves it. Three concrete inventions came out of this stance. First, a reading
specification format that lets a new study enter the dashboard through review rather than through
code, with the evidence (document and page, header, or confirmed inference) stored next to every
column. Second, a quote checker: the model must cite page and verbatim text for anything it extracts
from a report, and the code searches that text on that page, so a paraphrase or a wrong page is
caught before anyone reads it. Third, "linked conditions": a rule that finds, in each experiment,
the pairs of conditions that only ever varied together, which is the information you need before
attributing an effect to one of them. The data work also produced a finding we did not expect: all
four droplets in PSI-117's 1 atm table are CFI flights, so the model-versus-measurement comparison
that the data invites is not an independent validation, and the dashboard says so point by point.
Finally, the simulation turns rows into a scene a person can read, while underlining on screen
which parts are reconstructed and refusing to invent what is missing.

### What factors did your team consider?

Scientific honesty first: measured, simulated and uncertainty values never enter the same average;
investigations are only crossed on pages that say what their sources share; every experiment's
cautions travel with its data and the assistant must read them before interpreting; what cannot be
read becomes an alert, never a correction; when a document contradicts the data, both are shown and
the data wins. Reproducibility: no AI in the load, no network, the same files give the same
database and the same seed. Provenance: file, sheet and line for every row; page and quote for every
document-derived fact. Cost: every model call shows its estimated cost before and its real cost
after, with hard limits on rounds, tokens and document size. Security: uploaded archives are treated
as hostile input (paths, links, size, compression ratio), and document content is data, never
instruction. Privacy: researchers' personal data in the PSI metadata is deliberately not loaded.
Accessibility of the result: it runs offline with no downloads, in English by default, with fixed
colors per category so filtering never recolors a chart. And the rules of the challenge: NASA data
as the core, no NASA branding, full citation of data and tools, and a plain disclosure of where AI
was used.

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
