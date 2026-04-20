import { scanMlFile } from "../scanners/ml-scanner.js";

const SAMPLE_ML = `
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler
from feast import Feature, Field

# Feature selection
X = df[["email", "username", "created_at"]]
features = df["amount"]

# ColumnTransformer
preprocessor = ColumnTransformer([
    ("num", StandardScaler(), ["created_at"]),
    ("cat", OneHotEncoder(), ["username"]),
])

# Feast fields
schema=[
    Field(name="email", dtype=feast.types.String),
    Field(name="user_id", dtype=feast.types.Int64),
]

# dbt refs
orders = source("public", "orders")
user_dim = ref("users")

# pandas groupby
revenue = df.groupby("user_id").sum()
`;

describe("ML Scanner", () => {
  const deps = scanMlFile(SAMPLE_ML, "features.py");

  it("detects sklearn feature selection via X = df[[...]]", () => {
    const found = deps.find(
      (d) => d.pattern === "sklearn.feature_selection" && d.referencedTable === "email"
    );
    expect(found).toBeDefined();
    expect(found!.confidence).toBe("high");
  });

  it("detects Feast Field definitions", () => {
    const emailField = deps.find(
      (d) => d.pattern === "feast.Field" && d.referencedTable === "email"
    );
    expect(emailField).toBeDefined();
  });

  it("detects dbt source() references", () => {
    const ordersRef = deps.find(
      (d) => d.pattern === "dbt.source" && d.referencedTable === "orders"
    );
    expect(ordersRef).toBeDefined();
    expect(ordersRef!.confidence).toBe("high");
  });

  it("detects dbt ref() references", () => {
    const usersRef = deps.find(
      (d) => d.pattern === "dbt.ref" && d.referencedTable === "users"
    );
    expect(usersRef).toBeDefined();
  });

  it("detects pandas groupby column", () => {
    const found = deps.find(
      (d) => d.pattern === "pandas.groupby_merge" && d.referencedTable === "user_id"
    );
    expect(found).toBeDefined();
  });

  it("assigns python language", () => {
    expect(deps[0].language).toBe("python");
  });

  it("does not crash on empty input", () => {
    expect(() => scanMlFile("", "empty.py")).not.toThrow();
  });
});
