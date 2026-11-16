"""Text normalization shared by metadata, search and review."""

import re
import unicodedata


def fold(text: object) -> str:
    """Minúsculo e sem acento: 'Extinção' → 'extincao'."""
    decomposed = unicodedata.normalize("NFKD", str(text or ""))
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold()


def acronyms(hardware: str | None) -> set[str]:
    """Siglas do equipamento entre parênteses: 'Multi-User Droplet Combustion Apparatus (MDCA)' → {'MDCA'}."""
    return set(re.findall(r"\(([A-Z][A-Za-z0-9-]{1,10})\)", hardware or ""))
