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

Zorbital is an interactive dashboard that gathers NASA's public experiments on how fire behaves
without gravity and makes them readable, comparable and trustworthy in one place. NASA's Physical
Sciences Informatics repository holds decades of these results, but each experiment published its
data in its own format, and the answers people need — in which conditions did a flame go out, what
materials burned, how do two experiments relate — are hard to get without weeks of manual work.

Zorbital loads six investigations from the repository, cleans and organizes them without altering
the original files, and keeps a record of where every number came from. For each experiment it
shows the question that experiment answers, how complete the data is, a fact sheet (fuels, samples,
test conditions, what was measured, what varied and what stayed fixed), and the cautions that
scientists attached to the results. A 3D simulation reconstructs each test from the recorded
values, from the Space Station down to the combustion chamber, and tells the viewer which parts are
data and which are illustration. Comparison pages say, with explicit rules, when two experiments can
be compared and when they cannot. An AI assistant on every page explains what is on screen.

The assistant and the other AI features follow one principle: the AI proposes, the software checks,
and a person approves. The assistant can only consult the data through a fixed set of queries, so
every number it gives comes from the data and is shown with its source. When a new experiment is
added, the AI reads its documents and proposes how to interpret each column, citing the page it
relied on; the software verifies the citations and a curator reviews and approves before anything
is stored. The AI never writes to the database.

### What benefits does it offer?

For researchers and engineers, it turns a scattered archive into a single, organized source where
every value carries its origin and its caveats, and where the question "can these two experiments
be compared?" gets an answer based on the actual test conditions. For students and the public, it
makes decades of space combustion science explorable without specialist tooling. For the people
who maintain the collection, it offers a way to add new experiments through review rather than
through programming. For everyone, it offers an AI assistant that cannot invent numbers and always
says what its answer is based on. The whole dashboard runs on an ordinary computer, offline, with
no downloads.

### What is the intended impact of the project?

Fire is one of the risks that grows with the length of a mission, and the knowledge needed to design
safe habitats for the Moon and Mars already exists — scattered across files and reports that few
people have the time to reconcile. Zorbital aims to shorten the distance between "NASA has tested
this" and "here is what the tests show, under which conditions, and what they do not show", so that
scientific evidence reaches the people making design decisions with its limits intact. More broadly,
it demonstrates a responsible way to put AI in front of experimental data: not as an oracle, but as
a proposer whose work is checked and approved by people.

### What tools, coding languages, hardware, or software did you use to develop your project?

The data processing and the server are written in Python, with open-source libraries for data
analysis and an embedded analytical database; the interface is a web application written in React
and TypeScript, with charts and the 3D simulation drawn by our own code. The AI assistant uses
Anthropic Claude models through a language-model gateway. The data comes exclusively from NASA's
Physical Sciences Informatics repository, downloaded manually and loaded unchanged. No special
hardware is needed: it runs on a laptop. The project has automated tests for the data pipeline, the
server, the assistant and the interface. An AI coding assistant was used in pair-programming to
write code and documentation, under the team's direction and review; this is disclosed in the
repository.

### How is your project creative?

Most AI-powered dashboards place the model between the user and the data and trust it to be
accurate. Zorbital turns that around: the AI never touches the data directly. It proposes — a query
to run, a way to read a column, a sentence from a report — and the software verifies the proposal
before a person accepts it. This led to three ideas we have not seen elsewhere in this form: new
experiments can be added through a reviewed interpretation rather than new code; every fact the AI
extracts from a report must come with the page and the exact quote, which the software checks
against the document; and each experiment's fact sheet reveals which test conditions always changed
together, which is what a reader needs before attributing an effect to one of them. Working this
carefully with the data also surfaced a finding worth sharing: a comparison the archive seems to
invite — a ground model against flight measurements — turns out not to be an independent check,
because the "measurements" are the same flights, and the dashboard shows this point by point.
Finally, the simulation lets a person see each test as a scene while being told exactly which parts
are reconstructed.

### What factors did your team consider?

We started from the question "how could this dashboard mislead someone?" and designed against each
answer. Different kinds of evidence (measurement, simulation, uncertainty) are never averaged
together. Experiments are only compared on pages that state what the sources share. Each
experiment's cautions travel with its data, and the assistant must read them before interpreting
anything. Values that cannot be read as they are become alerts, never silent corrections; when a
document and the data disagree, both are shown and the data prevails. We also considered
reproducibility (the same files always produce the same result, with no AI in the pipeline),
transparency of cost (every AI call shows its estimated and real cost), security of uploaded files,
the privacy of the researchers named in NASA's metadata (deliberately not loaded), and access
(offline, in English, readable colors). And we considered the rules of the challenge: NASA data at
the core, no NASA branding, full citation of data and tools, and a plain disclosure of where and how
AI was used.

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
