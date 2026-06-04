"""Scope-collision case: a Python script with a LOCAL variable named `email`
that has nothing to do with the users.email database column.

If check_impact reports this file when users.email is renamed, that's a FALSE
POSITIVE — exactly the zero-noise failure mode the spec warns about.

This file has no SQL, no pd.read_sql, no spark.sql — just local string handling.
"""

def normalize(email: str) -> str:
    """Lowercase and trim an email-like string. Not connected to any DB."""
    return email.strip().lower()

def is_valid(email: str) -> bool:
    return "@" in email and "." in email.split("@")[-1]

if __name__ == "__main__":
    sample = "  Test@Example.com  "
    print(normalize(sample), is_valid(sample))
