import sqlite3

conn = sqlite3.connect('db.sqlite3')
cursor = conn.cursor()

# Get all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = cursor.fetchall()
print("Tables:", [table[0] for table in tables])

# Get distinct parties from constituencies table
cursor.execute("SELECT DISTINCT party FROM electionsapp_constituency ORDER BY party;")
parties = cursor.fetchall()
print("\nParties in constituencies:")
for party in parties:
    if party[0]:  # Skip None values
        print(f"- {party[0]}")

conn.close()
