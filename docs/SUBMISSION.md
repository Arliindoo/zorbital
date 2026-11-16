# Space Apps 2026 — project presentation draft

English presentation text aligned with [PRODUCT-VISION.md](PRODUCT-VISION.md). It distinguishes
what the current prototype demonstrates from the intended research workflow and planned simulation
agent. The first simulation proposal is detailed in [SIMULATION.md](SIMULATION.md). Recorded
validation and remaining evaluation needs are in [VALIDATION.md](VALIDATION.md).

## Project Name

Zorbital — AI-assisted research and simulation

## High-Level Project Summary

Zorbital is being developed as a research platform that starts with the user's own experiments.
Scientists and engineers bring their data, documents and questions; the intended workflow connects
that research to relevant NASA evidence and helps explore what could happen under changed
conditions. A planned simulation agent will propose suitable scientific models, prepare parameters
from identified sources, ask for essential missing inputs and conduct calculations through
scientific tools. Results will be explored through comparisons, charts and 3D visualization, while
the researcher develops the scientific conclusion.

The current prototype establishes part of that foundation with six NASA PSI investigations,
reviewed data imports, provenance, study fact sheets, rule-based comparisons, a page-scoped AI
assistant and 3D reconstructions. Independent research projects, live NASA discovery, the simulation
agent and predictive calculations for changed gravity or pressure remain planned capabilities.

## Link to Project

https://github.com/Arliindoo/zorbital

## Project Demo

Demo link: to be added. The demonstration should identify implemented capabilities and clearly
label any proposed workflow shown alongside them.

## Detailed Project Description

### What does it do or how does it work?

The intended journey begins with a research question: “Here are my experiments. Is there related
NASA research, and what might change if I reduce the pressure?” Zorbital should help organize the
uploaded data, clarify units and experimental conditions, discover relevant external work and
explain the basis and limits of comparisons. The researcher selects evidence and decides which
hypotheses to investigate.

For virtual experiments, a specialized simulation agent is planned to identify appropriate models,
prepare a reviewable configuration and invoke scientific computation. It should distinguish values
measured by the researcher, values obtained from references, estimates and assumptions. The user
should be able to begin with a question and review important choices without manually entering
every internal model parameter. Computed results will feed the same charts and 3D views used to
compare scenarios. Model selection and scientific evaluation are still required before presenting
new gravity or pressure scenarios as supported predictions.

Today, the repository implements a local data pipeline and dashboard for FLEX, CFI, PSI-117,
BASS-II, PSI-142 and BASS. It preserves source information, normalizes supported formats, records
quality findings and produces study fact sheets. Users can inspect comparisons, ask a page-scoped
assistant and explore reconstructions for supported studies. Importing another study currently
requires a PSI identifier, tables and documentation; code checks the AI's proposed reading and a
person reviews it before adoption into the local catalog. This is the starting implementation for
the broader research journey.

### What benefits does it offer?

The intended benefit is to reduce the work between collecting experimental data and investigating
it in the context of existing knowledge. Researchers should be able to locate related evidence,
understand whether conditions are comparable, prepare virtual experiments and trace the basis of
their conclusions. The simulation agent is intended to make technical setup more accessible while
keeping model choices, assumptions and missing information available for inspection.

The prototype already provides an inspectable reference collection, reviewed interpretation of
uploaded data, common units in fact sheets, quality alerts and visual context for selected
experiments. It also exposes shared provenance: the documented PSI-117 × CFI match shows why some
comparisons cannot be treated as independent validation. These capabilities demonstrate the
approach to evidence that the full research platform should preserve.

### What is the intended impact of the project?

The initial application is combustion research relevant to understanding fire behavior in space.
The intended impact is to help researchers connect their own experiments with NASA's accumulated
evidence and investigate new conditions with explicit scientific models. The platform should
support the user's reasoning, preserve uncertainty and make the path from evidence to conclusion
inspectable.

The longer-term direction is a research environment with persistent projects, selected evidence,
model configurations, scenario results and researcher-authored conclusions. Extending beyond the
initial combustion scope requires suitable models and evaluation for each supported phenomenon.
The project does not claim that any uploaded dataset can automatically produce a valid simulator.

### What tools, coding languages, hardware, or software did you use to develop your project?

The current pipeline and API use Python, Polars, DuckDB, Parquet and FastAPI. The browser interface
uses React and TypeScript, with SVG charts and WebGL2 reconstructions. AI functions use an
OpenAI-compatible gateway through the OpenAI Python SDK. The bundled NASA data was downloaded
manually, and the versioned seed allows the dashboard to start without downloading the original
collection again.

The local reference views and reconstructions can operate without new external data access;
current AI calls require the configured gateway. The predictive engine, external NASA discovery
integration and simulation-agent execution architecture have not yet been selected. Software
checks and previously recorded results are documented separately from the scientific evaluation
that future predictive models will require.

### How is your project creative?

The product connects three activities around the researcher's own question: understanding their
experiment, finding external evidence and preparing virtual experiments. The planned simulation
agent would manage model and parameter preparation, while the researcher retains visibility into
the evidence and choices that affect interpretation. The 3D experience would make calculated
scenarios explorable alongside observations and reconstructed references.

The prototype demonstrates several foundations for this approach: reading specifications that can
be reviewed and applied reproducibly, document extraction with page and quote checks, fact sheets
that identify conditions that varied together, and comparisons that disclose shared source data.
These mechanisms can support the broader workflow without treating generated text or an animation
as proof of a scientific result.

### What factors did your team consider?

The product direction prioritizes the researcher's question, provenance, understandable scientific
choices and the ability to revisit an analysis. Original observations, model predictions,
reconstructions and assumptions must remain distinguishable. External references need identifiable
sources and coverage; simulation configurations need model versions and parameter origins.

In the current prototype, uploaded files are checked, reading and document interpretations are
reviewed, and the assistant uses controlled tools. These measures do not guarantee that every
AI-generated statement is correct. Future evaluation must assess model selection, evidence
fidelity, missing-input handling and scientific predictions as well as software behavior.
Research data must also remain separate from the distributable demonstration collection. The user
remains responsible for the scientific conclusion, supported by inspectable evidence and results.

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

AI is used in the current prototype for the page assistant, reading-specification proposals and
document fact-sheet proposals. Reading specifications and document interpretations go through code
checks and human review before adoption. The assistant uses restricted tools and grounding
instructions; its generated text has no final factual verifier. The model has no direct
database-writing tool. The gateway reports usage and cost.

The specialized simulation agent is part of the product vision. It is intended to propose grounded
model configurations, prepare parameters, invoke scientific tools and help evaluate results. It is
not implemented in the current prototype, and no predictive scientific engine has been selected.

AI coding assistance has also been used to develop code and draft documentation under the team's
direction. Earlier implementation work used Anthropic Claude; the current product documentation
was organized with OpenAI Codex. Recorded tests, human review status and remaining evaluation work
are documented in VALIDATION.md. This disclosure does not imply that every generated artifact or
proposed scientific model has already been independently validated.
