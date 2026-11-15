# Data

Everything in Zorbital comes from NASA's Physical Sciences Informatics (PSI) repository. Files were
downloaded by hand from each investigation's page, placed in `dados/` and never modified. This page
says what is loaded, how it was read, and what each investigation can and cannot support.

## The investigations

| Investigation | Environment | Evidence | Main table (rows) | Source file loaded |
|---|---|---|---|---|
| **PSI-69 FLEX** — Flame Extinguishment Experiment | ISS | experimental | `flex_ensaios` (34, **sample**) | `01_FLEX_amostra_verificada.csv` (challenge package; the full ~274-test table was not downloaded) |
| **PSI-39 CFI** — Cool Flames Investigation | ISS | experimental | `cfi_ensaios` (227) + `cfi_cameras` | `CFI_DataSummary_Spreadsheet_Jan2021.xlsx` (five sheets joined by test number) |
| **PSI-117** — Hot and cool flame extinction of n-dodecane | ground | experimental and simulation | `psi117_extincao` (31) + `psi117_extincao_1atm` (33) + `psi117_series_modelo` (640) + `psi117_tabelas` (9) | `PROCI_2023_*.csv`, `PROCI_2019_*.csv`, `ReadMe_List_of_Data.xlsx` |
| **PSI-25 BASS-II** — Burning and Suppression of Solids II | ISS | experimental | `bass_ensaios` (129) | `BASS-II Test Matrix by PI Final.xlsx` (one sheet per investigator) |
| **PSI-142** — Cool-flame extinction in counterflow (Princeton) | ground | points digitized from published figures | `psi142_conjuntos` (8) + `psi142_pontos` (6,741) | `PSI data summary Princeton with links.xlsx` + `Data Summary Table.csv` |
| **PSI-26 BASS** — Burning and Suppression of Solids | ISS | experimental (test log) | `psi26_ensaios` (122) | `PSI-26_Experimental table_BASS.csv`, loaded through the study-submission flow with the DLD and SRD documents |
| PSI metadata (25 investigations) | — | — | `metadados` (25) + `publicacoes` (361) | `DadosPsi.tar.gz` (ISA-Tab bulk download); researchers' names and contacts are not loaded |

Supporting tables: `investigacoes` (one row per investigation: question, cautions, links), `fontes`
(every file in `dados/` with hash, role and status), `alertas` (105 quality findings),
`psi117_cfi_correspondencia` (19), `ficha` and `ficha_vinculos` (fact sheets, 61 items and 12
linked-condition pairs), `estudo_colunas` (column dictionary of submitted studies). Six SQL views
provide ready summaries, including `v_psi117_comparacao` (measured and model side by side, never
averaged together) and `v_extincao_c12_comparacao` (PSI-117 next to CFI).

## How the files were read

- **Each file is identified by its content hash.** Exact copies and derived copies are recognized
  and not loaded twice; when an original and a sample exist, the original wins. The `fontes` table
  records every file's status and the reason.
- **Types are preserved.** Dates become dates, numbers become numbers. A cell with text in a numeric
  column (`OR`, `>500`, `none`) becomes empty, and the original text goes to `alertas` with an
  explanation. Nothing is corrected by assumption.
- **Free-text categories are extracted next to the original text, never instead of it.** The
  BASS-II material column (`"100 micron pmma film, 2 cm wide"`) yields material, geometry,
  thickness, width, diameter and color; rods with no material written stay "not written in source".
- **Measurement, model and uncertainty are separate rows**, tagged by `serie` and `natureza`. The
  PSI-117 wide table (pairs of columns side by side) is unpivoted so that no aggregation can mix them.
- **Meaningful zeros are not numbers.** In CFI, a cool-flame extinction diameter of `0` means the
  droplet was consumed without visible cool-flame extinction; it is stored as empty with a flag.
- **Every row carries its origin**: file, sheet and line for submitted studies; file for catalog
  tables.
- **Layouts are checked.** The PSI-142 reader verifies the header of each digitized block and
  fails loudly if the sheet layout changes (an earlier version read shifted columns silently; the
  tests now mirror the real layout).

## A finding worth knowing: PSI-117 × CFI

PSI-117 is a ground investigation that compares a model with "measurements". Matching its tables
against the CFI flight data shows that **all 4 droplets of its 1 atm table are CFI flights** (tests
1206, 1247, 1250, 1251; one of them with a different cool-flame value: 0 vs 2.972 mm) and that 1 of
the 11 points in its pressure table coincides with an individual CFI test. Comparing PSI-117 with
CFI therefore shows how far the model is from the full set of flights, not an independent
experimental second opinion. The comparison page opens with this and the match is available
point by point.

## Fact sheet per study

Computed from the loaded data at every load, with no AI: fuels and materials; sample shape and size;
conditions in common units (O₂ as mole fraction, pressure in atm, sizes in mm, flow in cm/s); what
was measured and which quantity it is (extinction diameter, burning rate, burning time, strain rate
at extinction, flame temperature, gases, flame emission, outcome); what varied between tests and
what stayed fixed; and **linked conditions**: pairs where some level of one condition only appears
with one level of the other. In FLEX, for example, high pressure only appears with one O₂ level, so
a difference in those tests cannot be attributed to pressure alone.

Items that only exist in documents (objective, sensors, fixed conditions) come from the document
sheet flow: the model proposes them with page and quote, code checks the quote on that page, and a
reviewer decides what enters. When a document states a range that the data does not match, the
sheet shows both and an alert is raised; comparisons follow the data.

## What not to conclude, per investigation

These cautions are shown on each study page and are consulted by the assistant before it interprets
anything.

**FLEX (PSI-69).** The end of the visible flame does not prove that all combustion stopped: cool
flames continue invisibly. "Disruption" is the classification of the end of a droplet test, not an
explosion. The header of the `CO` column lost the gas subscript; do not treat it as CO₂ without
confirmation. The unit of `Burning rate; mm` must be checked in the report. Filtering only
extinctions does not isolate the effect of oxygen: droplet size and pressure also change.

**BASS-II (PSI-25).** The table has no risk label: do not rank materials by safety from it. `Fan
display` and `Air display` are panel readings, not calibrated velocities in cm/s. CO/CO₂ variation
depends on duration, volume and protocol; it is not the material's risk. Rods and films with no
material written are probably PMMA, but that is not in the source.

**PSI-117.** Measurement and model are different kinds of evidence and are never averaged together.
Their difference must be read against the reported uncertainty band, which exists only for the cool
flame. The association of these tables with the PSI-117 publications still needs confirmation. The
model was calibrated with FLEX flight data and the CFI ran on the same apparatus, so comparing it
with CFI is not an independent validation.

**CFI (PSI-39).** `Dext,cool = 0` in the source means the droplet was consumed without visible
cool-flame extinction, not a 0 mm diameter. 81 of 227 tests have "Completed Analysis = No". Part of
the cool-flame extinction diameters were extrapolated. Extinction diameter depends on initial
diameter: compare tests with similar D0. Radiometry columns and hot-flame time have no unit. The
"Flex Number" is the test numbering of the FLEX apparatus, not a PSI-69 test.

**PSI-142.** These are points taken from published figures, not raw measurements: precision is that
of the digitization. The flames are counterflow flames, not droplets: the limit is a strain rate
(1/s), not directly comparable with a droplet extinction diameter. Spreadsheet and CSV disagree
about ozone in sets 1–2 and about the DOIs of sets 6–8: check the paper before citing. In set 6,
the nC10 and nC7 series appear to have x and y swapped in the source.

**BASS (PSI-26).** The table is a test log (date, order, sample): it has no burning or extinction
results. The documents available (DLD and SRD) are requirements documents written before the
flight; the sheet marks what they describe as planned.

**Across investigations.** They answer different questions. Do not compare liquid-droplet
extinction diameters (FLEX, CFI) with solid-material behavior (BASS-II, BASS) or with counterflow
flame limits (PSI-142). The only numeric comparison in the dashboard is the n-dodecane extinction
diameter by pressure between PSI-117 and CFI, and it carries its own caution.

## What the data can and cannot support

| Claim | Supported? |
|---|---|
| NASA has tested extinction of liquid-fuel droplets in microgravity | Yes (FLEX, CFI) |
| NASA has tested burning of solid materials under varied O₂ and ventilation | Yes (BASS-II, BASS) |
| PSI-117 holds measurement and model of extinction side by side | Yes; the exact link to its publications is still being confirmed |
| Comparing PSI-117 with CFI validates the model independently | **No**: part of PSI-117's measurements are CFI flights, and the dashboard shows which |
| The end of the visible flame in FLEX means combustion is over | **No**: cool flames continue invisibly |
| A BASS-II fan display reading is a velocity in cm/s | **No**: it is a panel reading |
| Larger CO/CO₂ variation in a BASS-II test means a more dangerous material | **No**: it depends on duration, volume and protocol |
| The dashboard predicts fires or gives operational guidance | **No** |

## Sources

- NASA PSI: https://psi.nasa.gov/ — investigations PSI-69, PSI-25, PSI-26, PSI-39, PSI-117, PSI-142
  (links and DOIs in the root README).
- FLEX report: https://ntrs.nasa.gov/citations/20150023456 · BASS-II summary report:
  https://ntrs.nasa.gov/citations/20210011385
- Challenge: https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/
- Third-party tabular copies consulted only to select the investigations:
  https://github.com/AnteurAbderraouf/Fotia/tree/main/combustion_science
