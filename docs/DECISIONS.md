# Design decisions

The choices that shaped the current prototype, with their costs and reasons. The confirmed
[product vision](PRODUCT-VISION.md) changes several assumptions. Entries below explain existing
code; they do not override the user-owned research journey or rule out predictive simulation.

## Current decisions and planned evolution (2026-11-15)

| Decision area | Status and consequence |
|---|---|
| Provenance, originals, units, evidence types, alerts and reviewed interpretations | Preserve as principles across the research workflow |
| Deterministic ingestion | Preserve; add external discovery as a separate operation with recorded sources |
| Fixed tool interfaces | Preserve controlled execution; revisit page-only scope to support project evidence, search and scenarios |
| Specialized simulation agent | Product direction agreed; model selection, parameter preparation, execution tools and evaluation workflow remain to be designed |
| PSI identity and approval into the global catalog | Revisit for independent research projects and dataset versions |
| Global database rebuild and export to the seed | Revisit lifecycle boundaries so research data is not automatically prepared for distribution |
| 3D reconstruction | Keep as an existing capability; predictive simulation requires a separate model and scientific evaluation |
| One page per catalog investigation | Revisit the primary navigation around user research; existing study pages remain reference views |
| Local deployment, browser-only history, no accounts or queue | Current implementation choices; future project persistence and execution requirements remain to be designed |
| Python, React, DuckDB, SVG and WebGL2 | Existing technologies; the product correction alone does not establish a need to replace them |

The [product vision](PRODUCT-VISION.md) explains the research journey behind these design needs.
The predictive solver, NASA integration interface and future infrastructure remain to be selected.

## Python on the server, React in the browser

The prototype uses Python for data loading, aggregation and the assistant's tools, with Polars and
DuckDB behind a FastAPI API that serves prepared tables. The first version drew the screen with
Streamlit from the same Python code; it was
replaced by a React + Vite + TypeScript front end so that filters, charts and counts run in the
browser (moving a filter never goes to the server), each page is one API call cached by TanStack
Query, and the simulation could be drawn in WebGL2. Cost: two processes in development and a build
step for production. We would revisit the server language if the project became continuous
ingestion or a multi-user service.

## One API call per page; the browser does the rest

Each page requests `GET /api/pages/<page>` once and receives its tables with column types. Filters,
charts and counts are computed client-side; the database only changes when a submission is
approved, and approval invalidates the cache. Large sets (PSI-142's thousands of points) are
fetched one set at a time; side-by-side sheets are computed on the server, one call per combination.
Page filters live in the tab's session storage, so leaving and coming back keeps them. Cost: the
browser holds a page's data in memory; acceptable at the current volumes (a few thousand rows).

## Hand-drawn SVG charts and hand-written WebGL2, no charting or 3D library

Charts are React-rendered SVG with fixed category colors (outcome, flame type, material, fuel keep
the same color on every page; filtering never recolors the remaining series). The simulation is a
line-drawing engine in WebGL2: geometry goes to the GPU once (instanced segments, one draw call per
batch), Earth and flames are computed in the fragment shader, particles keep no CPU state, the loop
stops when the tab is hidden or the scene is off-screen, and internal resolution adapts to frame
time. Cost: more code to own than a library would need; gain: a visual system that is one piece,
small bundles, and pages loaded on demand.

## The simulation is a reconstruction, and the screen says which parts are data

The simulation view descends by scale (ISS in orbit → Destiny laboratory and rack → combustion
chamber; or Earth → optical bench → reaction zone between the nozzles) and replays the chosen test
from source values: droplet diameters, times, rates, gas composition, sample dimensions, digitized
points. Between two measured diameters of a droplet the curve follows the d² law, a reconstruction
that passes through the measured ends. Flame position and glow, tracer flow, needle and igniter
choreography and the mock-ups (ISS, Destiny, racks, burner) are schematic illustration. On screen,
reconstructed or estimated values are underlined with a dashed line, an ⓘ button lists test by test
what each element is, and when the data to reconstruct is missing the test is shown as "no
reconstruction" with the reason. Some missing quantities are estimated from available source
values under explicit assumptions: FLEX can estimate an extinction diameter assuming the ambiguous
burning-rate unit is mm²/s. Such reconstructions are not validation of predictions for changed
gravity or pressure; their assumptions need evaluation before reuse in a predictive model.

## English by default, Portuguese in the settings

The interface language defaults to English for the Space Apps audience and can be switched to
Portuguese. The data, the fact sheets and the assistant's system prompt stay in Portuguese in both;
in English mode the assistant is instructed to answer in English and translate what it quotes,
keeping column names and identifiers as they are.

## The files are the source; the database is a derived artifact

The PSI files have incompatible layouts and repeated copies. A single load step turns them into one
DuckDB file, rebuilt entirely on every run, which is where duplicates, types, categories and alerts
are decided once. Alternatives: reading the files directly on each page (repeats the treatment and
has nowhere to record duplicates and alerts), SQLite (does not read Parquet or Arrow natively),
loose Parquet files (no views, no single file to point to). Cost: one extra command before new data
shows up.

## Alerts, never corrections

Cells like `OR`, `>500`, `none`, dates in 2103 and zeros that mean "did not happen" are recorded
with their original value in an alerts table, and the typed field stays empty. Coercing silently
loses the information; "fixing" invents a number the source does not have, which is exactly what
the challenge brief warned against. Cost: empty fields where one would like a number.

## Measurement, model and uncertainty as rows, never as columns to sum

PSI-117 publishes `Dext_HF_EXPT` next to `Dext_HF_model`; the mean of the two is meaningless. In
long format, mixing them requires a `GROUP BY` that ignores the series tag, which our views never
do. Cost: more rows and charts that must pivot.

## A versioned seed instead of versioned data

`dados/` is 19 MB of third-party files downloaded by hand and kept out of git. Versioning the
DuckDB file would change on every run and weigh 5.6 MB; CSV loses types; documenting the download
would make a fresh clone open empty. The seed is the database's tables as Parquet (zstd, 336 KB),
rewritten only when content changes so that git only records real data changes; views stay out of
it and are recreated by code. Cost: one more artifact to commit after a load (the load says so).

## One page per investigation rather than a generic screen

The first generic comparison screen (today's "Explore" page) computed the mean of measured,
simulated and uncertainty values of PSI-117 and showed 1.5075 mm as if it were a number. Each
investigation gets its own page, filters and charts; cautions sit in the header. Submitted studies
use a generic page driven by their approved column dictionary. Cost: a new catalog investigation
means a new page. The Explore page is kept as an inspection tool, documented as such; replacing it
is pending.

## The assistant only has fixed queries with closed parameters

Text-to-SQL would be the most flexible option and the most dangerous: it lets the model join
investigations, aggregate across natures and read anything. Each tool is a function with a closed
parameter list and a fixed query that already carries its caution (the BASS-II grouping tool says
"this is not a risk ranking"). Scope is enforced in `tools.execute`, not in the prompt: a tool from
another page is refused even if the model invents it, quality tools answer only about the page's
investigation, and only the comparison pages' tools cross studies. Cost: questions outside the
repertoire get no answer; each new investigation needs two or three tools; at most 10 tools per
page (the PSI-117 page is at the limit).

## The `openai` SDK pointed at the gateway, with the model checked before spending

The gateway speaks the OpenAI protocol and routes to several vendors' models. The default model is
`anthropic/claude-sonnet-5.5` because the documented example model did not exist on our credential,
which made the first version of the chat silently mute: the error arrived inside the SSE stream
after an HTTP 200. Now errors from the stream are translated for the user, and the model catalog is
checked before the first question so that an unusable model is reported without cost. Limits: 6 tool
rounds per question, 10 questions of history (cut only at user-message boundaries so a tool call is
never separated from its result), temperature 0.2, 1,500 output tokens.

## The model proposes a reading specification; code reads the tables

Each catalog investigation cost a hand-written reader. For new studies the model receives a profile
of the spreadsheets (12 sample rows per sheet, not the whole file) and the documents' text, and
returns a JSON specification: what each column is, its unit, nature, special values, lines to
exclude, cautions, and for every interpretation where it came from (document and page, header, or
inferred). Alternatives rejected: the model generating Python readers (needs code review per study
and can do anything), the model returning the rows themselves (not reproducible, does not fit the
response), the model generating import SQL (does not read xlsx). A deterministic validator checks
the proposal and sends mechanical problems back up to twice. Inferences start unconfirmed and block
approval until a reviewer confirms them. Approval copies the files to `dados/PSI-XX/`, writes
`estudo.json` next to them and runs the load; from then on the generic reader applies the spec
identically on every run. Supported layouts: a simple table, and several sheets with the same
columns stacked. A document is mandatory in a submission, because without one every interpretation
is a guess. A separate, more capable model can be configured for this analysis; the estimated cost
is shown before the call.

## Uploaded archives are hostile input, even from the maintainer

`.zip`, `.rar` and `.tar.gz` are unpacked with checks per entry: no paths escaping the folder, no
links or special files, 300 MiB unpacked total, 2,000 files, a 200:1 compression ratio cap on files
above 10 MiB, two nesting levels, system junk ignored. `.rar` goes through `7z` with the same checks.

## A common vocabulary for the fact sheets

To compare studies, pressure must be pressure whether the source says mmHg or atm, and O₂ must be a
fraction whether the source says 21 or 0.21. A small vocabulary of attributes with fixed units
(fuel, sample shape and size, burner size, support, O₂, N₂, He, diluent, pressure, flow velocity,
ventilation, temperature, extinguishing agent, other condition) and of measured quantities
(extinction diameter, burning rate, burning time, strain rate at extinction, flame temperature,
gases, flame emission, outcome) is the key that fact sheets, hub filters and side-by-side
comparisons share. Catalog columns are mapped explicitly; submitted studies declare the attribute
and quantity per column, proposed by the model and confirmed in review. Units the code cannot
convert stay as in the source, with a note, and are excluded from ranges and filters. The
"extinguishing agent" attribute exists because the first real document analysis filed the nitrogen
blown to extinguish BASS samples as the atmosphere's diluent and its nozzles as "burner size".

## Linked conditions: a rule, not a correlation

A pair of conditions is "linked" when some level of one (with at least two tests) only appears with
one level of the other, and the other varies in the study. Numeric values are grouped into natural
levels (a new level whenever the value jumps more than 10 %; with 8 or fewer distinct values each is
a level). Pairs that are complementary by construction (N₂ is the rest of the mixture; the diluent
repeats helium) and pairs of sample attributes (material, shape and size are the same object) are
excluded. A first version by quartiles produced 26 noisy pairs and missed the obvious FLEX one
(high pressure only with one O₂ level); this rule finds it with 12 pairs overall.

## The document sheet: quotes are checked by code, and the data outranks the document

For objective, sensors and fixed conditions, the model must cite file, page and a verbatim quote.
Code normalizes both texts (letters and digits only, no accents) and searches the quote on the
cited page plus or minus one; paraphrases are rejected, page numbering mismatches are tolerated.
Verified items start checked, unverified ones unchecked; only what the reviewer checks is saved.
The check guarantees that the text exists, not that the interpretation is right, so review stays
mandatory. When a document's range does not cover the data's range, the sheet shows both with a
"divergent" mark and an alert; comparisons and filters use the data. Documents written before the
flight (requirements) are marked "as planned" and the mark is editable.

## Side-by-side verdicts are computed, not asked

Comparing 2–4 studies yields per pair: the overlapping ranges (2 % tolerance, so 0.997 and 1.0 atm
match), the quantities both measured, common fuels and a verdict (*comparable window*, *different
fuels*, *conditions do not overlap*, *no numeric condition in common*, *nothing measured in common*).
Warnings travel with the verdict: different environments or evidence types, the PSI-117 × CFI
relation, the same apparatus (acronyms in the PSI metadata, e.g. MDCA/CIR for FLEX and CFI), and
each study's linked conditions among the overlapping ones, because an overlapping window does not
mean the same combination was ever tested. "Different fuels" is its own verdict rather than a
footnote because it changes the answer.

## PSI metadata without personal data

The ISA-Tab bulk download carries objective, hypothesis, approach, hardware, period and
publications, and also the researchers' names, emails, phones and addresses. Only the former are
loaded, from an explicit field list, and a test checks that no person field or email reaches the
database or the public seed.
