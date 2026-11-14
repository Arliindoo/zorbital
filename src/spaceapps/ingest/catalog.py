"""O que se sabe de cada investigação e de cada arquivo que pode aparecer em `dados/`.

Metadados e cautelas vêm de `dados/Zorbital/LEIA_PRIMEIRO.md` e do catálogo de fontes do pacote.
"""

from __future__ import annotations

from dataclasses import dataclass

INVESTIGACOES = [
    {
        "id": "PSI-69",
        "nome": "FLEX — Flame Extinguishment Experiment",
        "categoria": "Gota de combustível líquido",
        "ambiente": "Microgravidade (ISS)",
        "tipo_evidencia": "Experimental",
        "tabela": "flex_ensaios",
        "pergunta": "Em que condições de pressão, oxigênio e tamanho de gota a chama visível se extinguiu?",
        "cautelas": (
            "O fim da chama visível não prova que toda combustão parou: chamas frias seguem invisíveis. "
            "'Disruption' é a classificação do fim do ensaio de gota, não uma explosão. "
            "O cabeçalho da coluna 'CO' perdeu o subscrito do gás; não tratá-la como CO2 sem confirmar. "
            "A unidade de 'Burning rate; mm' precisa ser conferida no relatório. "
            "Filtrar só extinções não isola o efeito do oxigênio: gota e pressão também mudam."
        ),
        "url_nasa": "https://psi.nasa.gov/physci/repo/data/investigations/PSI-69",
        "doi": "10.60555/mbq8-0451",
        "relatorio": "https://ntrs.nasa.gov/citations/20150023456",
    },
    {
        "id": "PSI-25",
        "nome": "BASS-II — Burning and Suppression of Solids II",
        "categoria": "Material sólido",
        "ambiente": "Microgravidade (ISS)",
        "tipo_evidencia": "Experimental",
        "tabela": "bass_ensaios",
        "pergunta": "Que materiais, geometrias, níveis de O2 e ventilação foram testados, e o que se mediu?",
        "cautelas": (
            "A tabela não tem rótulo de risco: não ranquear materiais por segurança a partir dela. "
            "'Fan display' e 'Air display' são leituras de painel, não velocidades calibradas em cm/s. "
            "Variação de CO/CO2 depende de duração, volume e protocolo; não equivale a risco do material. "
            "Hastes e filmes sem material escrito provavelmente são PMMA, mas isso não está na fonte."
        ),
        "url_nasa": "https://psi.nasa.gov/physci/repo/data/investigations/PSI-25",
        "doi": "10.60555/4qc4-de67",
        "relatorio": "https://ntrs.nasa.gov/citations/20210011385",
    },
    {
        "id": "PSI-117",
        "nome": "PSI-117 — Extinção de chamas quentes e frias de n-dodecano",
        "categoria": "Medição × modelo",
        "ambiente": "Investigação em solo",
        "tipo_evidencia": "Experimental e simulação",
        "tabela": "psi117_extincao",
        "pergunta": "Em que pressões o diâmetro de extinção previsto pelo modelo difere do medido?",
        "cautelas": (
            "Medição e modelo são evidências diferentes e não se misturam numa mesma média. "
            "A diferença entre eles precisa ser lida contra a faixa de incerteza informada, "
            "que só existe para a chama fria. "
            "A associação desta tabela às publicações do PSI-117 ainda precisa ser confirmada."
        ),
        "url_nasa": "https://psi.nasa.gov/physci/repo/data/investigations/PSI-117",
        "doi": None,
        "relatorio": None,
    },
]

GERAL = (
    "As três investigações respondem a perguntas diferentes. Não comparar diâmetro de gota líquida "
    "(FLEX) com comportamento de material sólido (BASS-II), nem pressão contra diâmetro entre estudos "
    "medidos em condições distintas. As linhas vêm de cópias públicas de terceiros e devem ser "
    "conferidas com o PSI e os relatórios da NASA antes de conclusões definitivas."
)


@dataclass(frozen=True)
class KnownFile:
    investigacao: str | None
    papel: str
    prioridade: int  # menor vence; só arquivos com leitor entram na disputa
    leitor: str | None = None


# Nome do arquivo → o que ele é. Entre arquivos da mesma investigação com leitor, carrega-se o
# de menor prioridade: o original completo, quando existe, ganha da amostra.
KNOWN_FILES = {
    "BASS-II Test Matrix by PI Final.xlsx": KnownFile(
        "PSI-25", "Original completo (matriz por pesquisador)", 1, "bass"
    ),
    "BASS-II.csv": KnownFile("PSI-25", "Cópia completa em CSV (gerador)", 9),
    "02_BASSII_amostra_verificada.csv": KnownFile("PSI-25", "Amostra (17 testes)", 9),
    "02_BASSII_condicoes_completas_AMOSTRA.csv": KnownFile("PSI-25", "Amostra normalizada (derivada)", 9),
    "FLEX.csv": KnownFile("PSI-69", "Original completo (gerador)", 1, "flex"),
    "01_FLEX_amostra_verificada.csv": KnownFile("PSI-69", "Amostra (34 ensaios)", 2, "flex"),
    "01_FLEX_experimentos_completos_AMOSTRA.csv": KnownFile("PSI-69", "Amostra normalizada (derivada)", 9),
    "PROCI_2023_C12_Extinction_Diameter_vs_pressure.csv": KnownFile(
        "PSI-117", "Original (gerador)", 1, "psi117"
    ),
    "03_PSI117_extincao_C12_arquivo_referencia.csv": KnownFile("PSI-117", "Cópia da tabela C12", 2, "psi117"),
    "03_PSI117_tabela_normalizada_amostra_AMOSTRA.csv": KnownFile(
        "PSI-117", "Tabela C12 normalizada (derivada)", 9
    ),
    "PROCI_2019_Stable_Cool.csv": KnownFile("PSI-117", "Modelo numérico: chama fria estável", 9),
    "PROCI_2019_Oscillatory_Cool_Flame.csv": KnownFile(
        "PSI-117", "Modelo numérico: chama fria oscilatória", 9
    ),
    "Zorbital_tabelas_amostra.xlsx": KnownFile(None, "Planilha com as três amostras (derivada)", 9),
}
DOC_SUFFIXES = {".md", ".json", ".ipynb", ".py", ".pdf", ".txt"}
