import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_SERVICE_KEY"]

client = create_client(url, key)

# Test: list tables we expect to exist
result = client.table("scrape_runs").select("id").limit(1).execute()
print("scrape_runs table: OK")

result = client.table("listings").select("id").limit(1).execute()
print("listings table: OK")

result = client.table("sold").select("estate_id").limit(1).execute()
print("sold table: OK")

print("\nDatabase connection and schema: VERIFIED")
