import pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
import feast
from feast import Feature, FeatureView, Field

# Feature selection from users table
df = pd.read_sql("SELECT * FROM users", engine)
X = df[["email", "username", "created_at"]]
features = df["email"]

# sklearn ColumnTransformer referencing column names
preprocessor = ColumnTransformer([
    ("num", StandardScaler(), ["created_at"]),
    ("cat", OneHotEncoder(), ["username"]),
])

# Feast feature store
user_features = FeatureView(
    name="user_features",
    entities=["user_id"],
    schema=[
        Field(name="email", dtype=feast.types.String),
        Field(name="username", dtype=feast.types.String),
    ],
)

# dbt source reference
orders_data = source("public", "orders")
user_data = ref("users")
