# A pathologically long string in the middle of a file. Scanner should not OOM.
big = "x" * 100000  # noqa
import pandas as pd
df = pd.read_sql("SELECT id FROM valid_table", None)
