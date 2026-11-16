# Zorbital documentation

Zorbital's intended journey starts with the user's own research, connects it to NASA evidence,
and uses a specialized simulation agent to prepare scientific calculations and explore their
results in 3D. The current prototype provides the foundation for part of this journey.

## Reading order and document responsibilities

For the Space Apps presentation, start with the root README and SUBMISSION, then use PRODUCT-VISION
for the complete intended experience. For development planning, read PRODUCT-VISION and SIMULATION
before the current architecture, decisions, data and validation records.

| Read this if you want to… | File |
|---|---|
| understand the ideal journey, how it improves the current product, the specialized agent and the evolution diagrams (English) | [PRODUCT-VISION.md](PRODUCT-VISION.md) |
| break the vision into actors, functional and scientific requirements, acceptance criteria and open decisions (Portuguese) | [REQUIREMENTS.md](REQUIREMENTS.md) |
| examine the proposed first simulation workflow, agent preparation and 3D experience (Portuguese) | [SIMULATION.md](SIMULATION.md) |
| understand the current architecture and boundaries to revisit | [ARCHITECTURE.md](ARCHITECTURE.md) |
| inspect the bundled NASA collection and its limitations | [DATA.md](DATA.md) |
| understand prototype decisions and which ones must be reconsidered | [DECISIONS.md](DECISIONS.md) |
| distinguish historical checks from missing product and scientific validation | [VALIDATION.md](VALIDATION.md) |
| read the English presentation draft, distinguishing product ambition from demonstrated capabilities | [SUBMISSION.md](SUBMISSION.md) |

PRODUCT-VISION owns product intent and the evolution path. SIMULATION expands the first simulation
experience. ARCHITECTURE describes existing code; DECISIONS explains its choices and decisions
still open. DATA owns the reference-data inventory and cautions. VALIDATION owns recorded checks
and future evaluation needs. The READMEs and SUBMISSION summarize these sources for their audiences.

## Status language

- **Current / implemented:** behavior present in the repository. A claim of validation must also
  identify its evidence in VALIDATION; implementation alone does not establish scientific validity.
- **Product vision / planned:** agreed direction that still requires implementation.
- **Proposed first delivery:** a candidate scope or sequence, such as the droplet scenario; it
  is not a completed feature or a committed delivery date.
- **Open decision:** a choice of model, integration, technology or scope still to be resolved.

## Consistent wording

| Concept | Preferred wording and meaning |
|---|---|
| Product | AI-assisted research platform / plataforma de pesquisa assistida por IA |
| User's starting point | Own research project / projeto de pesquisa própria, independent of NASA identifiers |
| NASA | External evidence and reference collection; distinguish local catalog search from external discovery |
| Relationships | Related research, compatibility and evidence comparison; name the method when claiming statistical correlation |
| Simulation agent | AI that proposes grounded models, prepares parameters, conducts execution and organizes evaluation |
| Scientific model | Mathematical representation with assumptions and an applicable domain |
| Scientific engine | Software that executes the identified calculation |
| Current 3D | Reconstruction or replay of supported experiments |
| Predictive simulation | Calculation for configured conditions; distinguish planned support from implemented support |
| Conclusions | Researcher-authored conclusions supported by evidence and AI assistance |

Use “AI proposes a grounded simulation configuration” instead of suggesting that model knowledge
alone validates a new physical model. Use “checks, review and evaluation” with their actual scope
rather than “AI cannot invent numbers.” A parameter is measured, sourced, estimated or assumed;
automatic preparation must preserve that distinction.

When a capability is delivered, update its status in PRODUCT-VISION, its implementation in
ARCHITECTURE, its evidence in VALIDATION and its summary in the READMEs and SUBMISSION. This keeps
the presentation consistent without rewriting the intended product around each prototype limitation.

The project overview, how to run it, the NASA resources, the references and the AI-use disclosure
are in the root [README.md](../README.md).
