"""Dashboard de combustão em microgravidade.

Rodar: uv run spaceapps-build   (uma vez, e sempre que `dados/` mudar)
       uv run streamlit run app.py
"""

import streamlit as st
from dotenv import load_dotenv

load_dotenv()
st.set_page_config(page_title="Zorbital — combustão em microgravidade", layout="wide")

page = st.navigation(
    {
        "": [st.Page("views/overview.py", title="Visão geral", icon=":material/dashboard:", default=True)],
        "Gotas de combustível": [
            st.Page("views/flex.py", title="FLEX · extinção de gotas (ISS)", icon=":material/water_drop:"),
            st.Page("views/cfi.py", title="CFI · chamas frias (ISS)", icon=":material/ac_unit:"),
            st.Page("views/psi117.py", title="PSI-117 · medido × modelo (solo)", icon=":material/functions:"),
        ],
        "Outras chamas": [
            st.Page("views/bass.py", title="BASS-II · materiais sólidos (ISS)", icon=":material/layers:"),
            st.Page("views/psi142.py", title="PSI-142 · contrafluxo (solo)", icon=":material/swap_vert:"),
        ],
        "Comparações": [
            st.Page("views/comparacao.py", title="PSI-117 × CFI", icon=":material/compare_arrows:"),
        ],
        "Ferramentas": [st.Page("views/explore.py", title="Explorar", icon=":material/query_stats:")],
    }
)
page.run()
