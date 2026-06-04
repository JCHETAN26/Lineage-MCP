"""Real query that MUST be detected even though the adversarial files surround it."""
import pandas as pd
from sqlalchemy import create_engine

engine = create_engine("postgresql://localhost/app")

# This is the only real query in the adversarial fixture — must be found.
df = pd.read_sql("SELECT id, email FROM valid_table", engine)
