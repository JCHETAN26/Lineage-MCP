"""Adversarial Python: SQL-shaped strings hiding inside comments and docstrings.

If the scanner flags any of these, it has false-positive bugs.
"""

# This is a comment, not code: pd.read_sql("SELECT email FROM users", engine)

example_docstring = """
Imagine if I wrote pd.read_sql("SELECT * FROM users", conn) here.
The scanner should ignore docstring contents that look like real queries.
"""

# String concatenation that LOOKS like SQL but is actually building log messages
log_msg = "Loaded " + str(42) + " rows from users table"

# A variable named like a table — must not trigger a hit
users = ["alice", "bob"]
orders = {"id": 1, "amount": 100}

if __name__ == "__main__":
    print(users, orders)
