import pandas as pd
from sqlalchemy import create_engine

engine = create_engine("postgresql://localhost/mydb")

def load_users():
    df = pd.read_sql("SELECT id, email, username FROM users WHERE created_at > '2024-01-01'", engine)
    return df

def load_active_orders():
    df = pd.read_sql_query("SELECT o.id, o.amount, u.email FROM orders o JOIN users u ON o.user_id = u.id", engine)
    return df
