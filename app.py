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
        "Investigações": [
            st.Page("views/flex.py", title="FLEX · gotas líquidas", icon=":material/water_drop:"),
            st.Page("views/bass.py", title="BASS-II · materiais sólidos", icon=":material/layers:"),
            st.Page("views/psi117.py", title="PSI-117 · medido × modelo", icon=":material/compare_arrows:"),
        ],
        "Ferramentas": [st.Page("views/explore.py", title="Explorar", icon=":material/query_stats:")],
    }
)
page.run()
