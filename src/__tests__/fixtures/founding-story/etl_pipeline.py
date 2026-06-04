"""ETL job: pulls users into pandas for downstream feature work."""
import pandas as pd
from sqlalchemy import create_engine

engine = create_engine("postgresql://localhost/app")

def load_users():
    df = pd.read_sql("SELECT id, email, name FROM users", engine)
    return df

def filter_active(df):
    return df[df["email"].notna()]
