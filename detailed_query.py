import sqlite3
import json

conn = sqlite3.connect('db.sqlite3')
cursor = conn.cursor()

# Check if there's any data in constituencies table
cursor.execute("SELECT COUNT(*) FROM electionsapp_constituency;")
count = cursor.fetchall()[0][0]
print(f"Total constituencies: {count}")

if count > 0:
    # Get sample data to see structure
    cursor.execute("SELECT name, party, election_results FROM electionsapp_constituency LIMIT 5;")
    sample_data = cursor.fetchall()
    print("\nSample data:")
    for row in sample_data:
        print(f"Name: {row[0]}, Party: {row[1]}, Results: {row[2]}")
    
    # Get all unique parties from party field
    cursor.execute("SELECT DISTINCT party FROM electionsapp_constituency WHERE party IS NOT NULL AND party != '';")
    parties = cursor.fetchall()
    print(f"\nParties from party field: {[p[0] for p in parties]}")
    
    # Get parties from election_results JSON field
    cursor.execute("SELECT election_results FROM electionsapp_constituency WHERE election_results IS NOT NULL AND election_results != '';")
    results = cursor.fetchall()
    all_parties = set()
    for row in results:
        try:
            if row[0] and isinstance(row[0], str):
                data = json.loads(row[0])
                if isinstance(data, dict):
                    all_parties.update(data.keys())
        except:
            pass
    print(f"Parties from election_results: {sorted(list(all_parties))}")

conn.close()
