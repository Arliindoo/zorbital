"""O que se sabe de cada investigação e de cada arquivo que pode aparecer em `dados/`.

Metadados e cautelas vêm de `dados/Zorbital/LEIA_PRIMEIRO.md` e do catálogo de fontes do pacote.
"""

from __future__ import annotations

import re
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
            "A associação desta tabela às publicações do PSI-117 ainda precisa ser confirmada. "
            "O modelo foi calibrado com dados de voo do FLEX, e os ensaios do CFI rodaram no mesmo aparelho: "
            "a 'medição' desta tabela pode vir desses mesmos voos, então compará-la com o CFI não é validação "
            "independente."
        ),
        "url_nasa": "https://psi.nasa.gov/physci/repo/data/investigations/PSI-117",
        "doi": None,
        "relatorio": None,
    },
    {
        "id": "PSI-39",
        "nome": "CFI — Cool Flames Investigation",
        "categoria": "Gota de combustível líquido · chama fria",
        "ambiente": "Microgravidade (ISS)",
        "tipo_evidencia": "Experimental",
        "tabela": "cfi_ensaios",
        "pergunta": (
            "Como pressão, hélio e combustível mudam a queima e a extinção das chamas quente e fria "
            "de gotas de n-dodecano?"
        ),
        "cautelas": (
            "Dext,cool = 0 na fonte quer dizer que a gota foi consumida sem extinção visível da chama fria, "
            "não um diâmetro de 0 mm: esses casos ficam vazios e marcados. "
            "81 dos 227 ensaios estão com análise não concluída (Completed Analysis = No). "
            "Parte dos diâmetros de extinção da chama fria foi extrapolada (Extrap CF?). "
            "O diâmetro de extinção depende do diâmetro inicial da gota: compare ensaios com D0 parecido. "
            "As colunas de radiometria e o tempo de chama quente não informam unidade. "
            "O 'Flex Number' é a numeração dos ensaios no aparelho do FLEX, não um ensaio do PSI-69."
        ),
        "url_nasa": "https://psi.nasa.gov/physci/repo/data/investigations/PSI-39",
        "doi": None,
        "relatorio": None,
    },
    {
        "id": "PSI-142",
        "nome": "PSI-142 — Extinção de chamas frias em contrafluxo (Princeton)",
        "categoria": "Chama em contrafluxo",
        "ambiente": "Investigação em solo",
        "tipo_evidencia": "Pontos digitalizados de artigos",
        "tabela": "psi142_pontos",
        "pergunta": (
            "Em que taxa de estiramento e fração de combustível as chamas frias e quentes de n-alcanos "
            "se extinguem, com e sem ozônio?"
        ),
        "cautelas": (
            "São pontos tirados de figuras publicadas, não medições brutas: a precisão é a da digitalização. "
            "As chamas são de contrafluxo, não gotas: o limite é uma taxa de estiramento (1/s), que não se "
            "compara diretamente com o diâmetro de extinção de uma gota. "
            "Planilha e CSV discordam sobre o ozônio nos conjuntos 1 e 2 e sobre os DOIs dos conjuntos 6 a 8: "
            "confira no artigo antes de citar. "
            "No conjunto 6, as séries nC10 e nC7 parecem ter as colunas x e y trocadas na fonte."
        ),
        "url_nasa": "https://psi.nasa.gov/physci/repo/data/investigations/PSI-142",
        "doi": None,
        "relatorio": None,
    },
]

GERAL = (
    "As investigações respondem a perguntas diferentes. Não comparar diâmetro de gota líquida "
    "(FLEX, CFI) com comportamento de material sólido (BASS-II), nem com limites de chamas em "
    "contrafluxo (PSI-142). A única comparação numérica feita no painel é o diâmetro de extinção de "
    "gotas de n-dodecano por pressão entre PSI-117 e CFI, e ela tem cautelas próprias. As tabelas "
    "devem ser conferidas com o PSI e os artigos da NASA antes de conclusões definitivas."
)


@dataclass(frozen=True)
class KnownFile:
    investigacao: str | None
    papel: str
    prioridade: int  # menor vence; só arquivos com leitor entram na disputa
    leitor: str | None = None
    complementa: str | None = None  # leitor que usa este arquivo como fonte auxiliar (metadados)
    coberto_por: str | None = None  # leitor cujo arquivo já contém tudo o que este tem


# Nome do arquivo → o que ele é. Entre arquivos da mesma investigação com leitor, carrega-se o
# de menor prioridade: o original completo, quando existe, ganha da amostra.
KNOWN_FILES = {
    "BASS-II Test Matrix by PI Final.xlsx": KnownFile(
        "PSI-25", "Original completo (matriz por pesquisador)", 1, "bass"
    ),
    "BASS-II.csv": KnownFile("PSI-25", "Cópia completa em CSV (gerador)", 9, coberto_por="bass"),
    "02_BASSII_amostra_verificada.csv": KnownFile("PSI-25", "Amostra (17 testes)", 9, coberto_por="bass"),
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
    # Demais tabelas do PSI-117, como listadas no ReadMe_List_of_Data.xlsx da própria investigação.
    "ReadMe_List_of_Data.xlsx": KnownFile(
        "PSI-117", "Catálogo das tabelas e condições de cada uma", 1, "psi117_readme"
    ),
    "PROCI_2023_Alkane_Extinction_Diameter_1atm.csv": KnownFile(
        "PSI-117", "Extinção a 1 atm: n-heptano, n-decano e n-dodecano, medida e simulada", 1, "psi117_1atm"
    ),
    "PROCI_2019_Stable_Cool.csv": KnownFile(
        "PSI-117", "Modelo numérico: chama fria estável (série temporal)", 1, "psi117_serie_estavel"
    ),
    "PROCI_2019_Oscillatory_Cool_Flame.csv": KnownFile(
        "PSI-117", "Modelo numérico: chama fria oscilatória (série temporal)", 1, "psi117_serie_oscilatoria"
    ),
    "PROCI_C12_2019_Three_Stage.csv": KnownFile("PSI-117", "Três estágios de combustão do n-dodecano", 9),
    "MST_2024_Burning_history_Flame_diameter.csv": KnownFile(
        "PSI-117", "Histórico de queima e diâmetro da chama", 9
    ),
    "MST_2024_Dext.csv": KnownFile("PSI-117", "Diâmetro de extinção (0,5–1,5 atm)", 9),
    "MST_2024_Kavg.csv": KnownFile("PSI-117", "Taxa média de queima (0,5–5 atm)", 9),
    "MST_2024_Radiance_Flame_Diameter.csv": KnownFile("PSI-117", "Radiância e diâmetro da chama", 9),
    "Zorbital_tabelas_amostra.xlsx": KnownFile(None, "Planilha com as três amostras (derivada)", 9),
    # PSI-39 CFI. O CSV é um subconjunto da Master Sheet da planilha (79 de 227 ensaios, com 8
    # linhas repetidas); a planilha traz também os resultados, então é ela que entra.
    "CFI_DataSummary_Spreadsheet_Jan2021.xlsx": KnownFile(
        "PSI-39", "Planilha completa: condições, resultados, ignição, câmeras e comentários", 1, "cfi"
    ),
    "CFI.csv": KnownFile("PSI-39", "Tabela de condições (subconjunto da planilha)", 9, coberto_por="cfi"),
    # PSI-142 Princeton. A planilha tem os pontos; o CSV, a descrição e o DOI de cada conjunto.
    "PSI data summary Princeton with links.xlsx": KnownFile(
        "PSI-142", "Pontos digitalizados de 8 figuras de artigos", 1, "psi142"
    ),
    "Data Summary Table.csv": KnownFile(
        "PSI-142", "Descrição e DOI de cada conjunto", 9, complementa="psi142"
    ),
    # Metadados do portal (ISA-Tab), um zip por investigação: objetivo, equipamento e publicações.
    "DadosPsi.tar.gz": KnownFile(
        None, "Metadados do portal NASA PSI de várias investigações", 1, "metadados"
    ),
}
DOC_SUFFIXES = {".md", ".json", ".ipynb", ".py", ".pdf", ".txt"}


def canonical_name(name: str) -> str:
    """O portal da NASA PSI prefixa os downloads com a investigação e a categoria
    ("PSI-117_Analyzed Data_", "PSI-39_Experimental table_"). O catálogo usa o nome sem prefixo."""
    return re.sub(r"^PSI-\d+_(?:Analyzed Data|Experimental table|[A-Za-z ]+)_", "", name)
