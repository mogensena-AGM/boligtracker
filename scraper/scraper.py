import os, time, random, logging
from datetime import datetime, date, timedelta
from dotenv import load_dotenv
from supabase import create_client
import urllib.request, json

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
USER_AGENT   = "BoligTracker/1.0 (personal hobby project; one daily request)"
PAGE_SIZE    = 500
MUNICIPALITIES = {"Copenhagen": 101, "Frederiksberg": 147}
FIVE_YEARS_AGO = (date.today() - timedelta(days=5*365)).isoformat()

db = create_client(SUPABASE_URL, SUPABASE_KEY)

def polite_sleep():
    time.sleep(3 + random.random() * 2)

def fetch(url, retries=3):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 60 * (attempt + 1)
                log.warning(f"Rate limited — sleeping {wait}s (attempt {attempt+1}/{retries})")
                time.sleep(wait)
            else:
                raise
    raise RuntimeError(f"Failed after {retries} retries: {url}")

def start_run(run_type, municipality):
    result = db.table("scrape_runs").insert({
        "run_type": run_type, "municipality": municipality, "status": "running"
    }).execute()
    return result.data[0]["id"]

def finish_run(run_id, api_calls, fetched, upserted, last_page, error=None):
    db.table("scrape_runs").update({
        "finished_at": datetime.utcnow().isoformat(),
        "api_calls": api_calls,
        "records_fetched": fetched,
        "records_upserted": upserted,
        "last_page": last_page,
        "status": "error" if error else "done",
        "error_msg": error,
    }).eq("id", run_id).execute()

def scrape_active(muni_name, muni_code):
    log.info(f"Scraping active listings: {muni_name} (municipality={muni_code})")
    run_id = start_run("daily_active", muni_code)
    api_calls = fetched = upserted = 0
    page = 1
    while True:
        url = (f"https://api.boliga.dk/api/v2/search/results"
               f"?pageSize={PAGE_SIZE}&page={page}&propertyType=3&municipality={muni_code}")
        data = fetch(url)
        api_calls += 1
        results = data["results"]
        fetched += len(results)
        if not results:
            break
        rows = [map_active(r) for r in results]
        db.table("listings").upsert(rows, on_conflict="id").execute()
        upserted += len(rows)
        log.info(f"  Page {page}: {len(results)} listings")
        if page >= data["meta"]["totalPages"]:
            break
        page += 1
        polite_sleep()
    finish_run(run_id, api_calls, fetched, upserted, page)
    log.info(f"  Done: {upserted} upserted, {api_calls} API calls")

def scrape_sold(muni_name, muni_code, since=FIVE_YEARS_AGO):
    log.info(f"Scraping sold: {muni_name} since {since}")
    run_id = start_run("backfill" if since == FIVE_YEARS_AGO else "daily_sold", muni_code)
    api_calls = fetched = upserted = 0
    page = 1
    cutoff = since
    while True:
        url = (f"https://api.boliga.dk/api/v2/sold/search/results"
               f"?pageSize={PAGE_SIZE}&page={page}&propertyType=3&municipality={muni_code}")
        data = fetch(url)
        api_calls += 1
        results = data["results"]
        fetched += len(results)
        if not results:
            break
        # Filter to cutoff date and map
        rows = {r["estateId"]: map_sold(r, muni_code) for r in results
                if r["soldDate"][:10] >= cutoff}.values()
        rows = list(rows)
        if rows:
            db.table("sold").upsert(rows, on_conflict="estate_id").execute()
            upserted += len(rows)
        oldest = results[-1]["soldDate"][:10]
        log.info(f"  Page {page}: {len(results)} records, oldest={oldest}, kept={len(rows)}")
        if oldest < cutoff:
            break
        page += 1
        polite_sleep()
    finish_run(run_id, api_calls, fetched, upserted, page)
    log.info(f"  Done: {upserted} upserted, {api_calls} API calls")

def ts(val):
    return val if val else None

def map_active(r):
    return {
        "id":            r["id"],
        "street":        r.get("street"),
        "zip_code":      r.get("zipCode"),
        "city":          r.get("city"),
        "municipality":  r.get("municipality"),
        "price":         r.get("price"),
        "size":          r.get("size"),
        "rooms":         r.get("rooms"),
        "floor":         r.get("floor"),
        "build_year":    r.get("buildYear"),
        "energy_class":  r.get("energyClass"),
        "sqm_price":     r.get("squaremeterPrice"),
        "days_for_sale": r.get("daysForSale"),
        "is_active":     r.get("isActive", True),
        "open_house":    ts(r.get("openHouse")),
        "created_date":  ts(r.get("createdDate")),
        "last_seen":     ts(r.get("lastSeen")),
        "updated_at":    datetime.utcnow().isoformat(),
    }

def map_sold(r, muni_code):
    return {
        "estate_id":   r["estateId"],
        "address":     r.get("address"),
        "zip_code":    r.get("zipCode"),
        "city":        r.get("city"),
        "municipality": muni_code,
        "price":       r.get("price"),
        "sold_date":   r["soldDate"][:10],
        "size":        r.get("size"),
        "rooms":       r.get("rooms"),
        "build_year":  r.get("buildYear"),
        "sqm_price":   r.get("sqmPrice"),
        "sale_type":   r.get("saleType"),
        "price_change": r.get("change"),
    }

if __name__ == "__main__":
    import sys
    mode = sys.argv[1] if len(sys.argv) > 1 else "test"

    if mode == "test":
        # Test with just Frederiksberg active listings (smallest dataset)
        scrape_active("Frederiksberg", 147)

    elif mode == "backfill":
        for name, code in MUNICIPALITIES.items():
            scrape_active(name, code)
            polite_sleep()
            scrape_sold(name, code)
            polite_sleep()

    elif mode == "daily":
        thirty_days_ago = (date.today() - timedelta(days=30)).isoformat()
        for name, code in MUNICIPALITIES.items():
            scrape_active(name, code)
            polite_sleep()
            scrape_sold(name, code, since=thirty_days_ago)
            polite_sleep()
