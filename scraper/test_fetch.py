import urllib.request
import json

URL = "https://api.boliga.dk/api/v2/search/results?pageSize=5&page=1&propertyType=3&zipcodes=2000"

req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req) as r:
    data = json.loads(r.read())

print(f"Total listings in zip 2000: {data['meta']['totalCount']}\n")
for apt in data["results"]:
    print(f"{apt['street']}")
    print(f"  Price:  {apt['price']:,} DKK  ({apt['squaremeterPrice']:,.0f} DKK/m²)")
    print(f"  Size:   {apt['size']} m²  |  Rooms: {apt['rooms']}  |  Floor: {apt['floor']}")
    print(f"  Built:  {apt['buildYear']}  |  Days for sale: {apt['daysForSale']}")
    print()
