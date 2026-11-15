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
— through a deterministic data pipeline that recognizes duplicate files, preserves data types,
extracts categories from free-text fields while keeping the original text, keeps measurement,
model and uncertainty as separate records, and registers every value it cannot read as an alert
with the original content instead of guessing. The result is a local database whose tables are
versioned with the code, so anyone who clones the repository opens the dashboard with all the data
and no downloads.

On top of it: one page per investigation with its own filters and charts, the question the data
answers, the source and its completeness, and the "what not to conclude" cautions taken from the
reports; a fact sheet per study computed from the data (fuels, sample shape and size, conditions in
common units, what was measured, what varied between tests and what stayed fixed, and which
conditions varied together and therefore cannot be separated); a 3D simulation that descends from
the Space Station or the laboratory to the experiment and replays the chosen test from the recorded
values, marking on screen what is data and what is illustration; two comparison pages with explicit
rules (PSI-117 against CFI with a point-by-point match, and side-by-side fact sheets with a verdict
per pair); and an AI assistant on every page.

The AI is used in three contained ways, all under one principle: the AI proposes, the software
checks, a person approves. The assistant can only consult the data through a fixed set of queries
enabled per page, so it cannot cross investigations outside the comparison pages, and every number
it cites comes from a query it shows; before answering, it reads the fact sheets and cautions of
the studies involved. When a new study is submitted, the AI reads the spreadsheets' structure and
the documents and proposes how to read each column, with the evidence for every interpretation;
the software validates the proposal, a curator confirms every inference, and from then on the
software applies that reading on every load. For a study's documents, the AI proposes objective,
sensors and fixed conditions with page and verbatim quote; the software checks that the quote
exists on that page; a reviewer decides what enters. The AI never writes to the database.

### What benefits does it offer?

Researchers and fire-safety engineers get decades of PSI combustion results already normalized,
with the provenance of every number and the cautions attached, and an answer to "can these two
studies be compared?" based on their actual test conditions rather than on intuition. Readers get an
assistant that cannot invent numbers and that states the basis of each one (filtered rows or whole
table, sample or complete data). Curators get a way to add investigations without writing a parser
for each: the AI proposes, the person reviews, the software applies. Students and the public get
decades of space combustion science that can be explored without specialist tools. Anyone can run
it offline on an ordinary computer, and the whole chain from source file to screen is reproducible.

### What is the intended impact of the project?

Fire is one of the risks that scale badly on long missions, and the knowledge needed to design for
it exists but is scattered across incompatible files and reports. The intended impact is to make
that knowledge usable with its limits intact: to shorten the path from "NASA has tested this" to
"here is what the tests show, under which conditions, and what they do not show", for the people
preparing Moon and Mars habitats. Beyond combustion, the project is a template for presenting
experimental physical-science data with AI in the loop: evidence types kept apart, provenance kept,
limits stated, and the model used as a proposer under human review rather than as an oracle.

### What tools, coding languages, hardware, or software did you use to develop your project?

The data pipeline and the server are written in Python, with Polars and DuckDB for analysis and
storage, Parquet for the versioned data, and FastAPI for the web API. The interface is a web
application in React and TypeScript; the charts are drawn in SVG and the 3D simulation in WebGL2,
both written by the team without a charting or 3D library. The AI assistant uses Anthropic Claude
models through an OpenAI-compatible gateway (Zyria), which also reports the cost of each call. The
data comes exclusively from NASA's Physical Sciences Informatics repository, downloaded manually and
loaded unchanged. No special hardware is needed: it runs on a laptop. Automated tests cover the
pipeline, the server, the assistant and the interface, and run without data or AI credentials. An
AI coding assistant was used in pair-programming to write code and documentation under the team's
direction and review; this is disclosed in the repository.

### How is your project creative?

Most AI dashboards put the model between the user and the data and hope the prompt keeps it honest.
Zorbital inverts that: the model never touches the data; it only proposes — a query to run, a way to
read a column, a sentence from a report — and the software verifies the proposal before a person
approves it. Three concrete ideas came out of this stance. First, a reviewable reading specification
that lets a new study enter the dashboard through review rather than through code, with the
evidence stored next to every column. Second, a quote check: the AI must cite page and verbatim
text for anything it extracts from a report, and the software searches that text on that page, so a
paraphrase or a wrong page is caught before anyone reads it. Third, "linked conditions": a rule that
finds, in each experiment, the pairs of conditions that only ever varied together — the information
a reader needs before attributing an effect to one of them. Working this carefully with the data
also produced a finding we did not expect: all four droplets in PSI-117's one-atmosphere table are
CFI flights, so the model-versus-measurement comparison that the archive invites is not an
independent validation, and the dashboard says so point by point. Finally, the simulation turns rows
into a scene a person can read, while underlining which parts are reconstructed and refusing to
invent what is missing.

### What factors did your team consider?

We started from the question "how could this dashboard mislead someone?" and designed against each
answer. Measured, simulated and uncertainty values never enter the same average. Investigations are
only crossed on pages that say what their sources share. Every experiment's cautions travel with its
data, and the assistant must read them before interpreting anything. What cannot be read becomes an
alert, never a correction; when a document contradicts the data, both are shown and the data wins.
We also considered reproducibility (no AI in the pipeline: the same files give the same result),
transparency of cost (every AI call shows its estimated and real cost, with hard limits), security
of uploaded files, the privacy of the researchers named in NASA's metadata (deliberately not
loaded), and access (offline, in English by default, with fixed colors per category so filtering
never recolors a chart). And we considered the rules of the challenge: NASA data at the core, no
NASA branding, full citation of data and tools, and a plain disclosure of where and how AI was used.

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
