-- Drop existing tables cleanly
DROP TABLE IF EXISTS daily_snapshots;
DROP TABLE IF EXISTS scrape_runs;
DROP TABLE IF EXISTS sold;
DROP TABLE IF EXISTS listings;

-- Active listings: snapshot of current market
CREATE TABLE listings (
    id            BIGINT PRIMARY KEY,
    street        TEXT,
    zip_code      INT,
    city          TEXT,
    municipality  INT,
    price         BIGINT,
    size          INT,
    rooms         NUMERIC(4,1),
    floor         INT,
    build_year    INT,
    energy_class  TEXT,
    sqm_price     NUMERIC(12,2),
    days_for_sale INT,
    is_active     BOOLEAN DEFAULT TRUE,
    open_house    TIMESTAMPTZ,
    created_date  TIMESTAMPTZ,
    last_seen     TIMESTAMPTZ,
    first_scraped TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Sold listings: historical data, de-duplicated by estate_id
CREATE TABLE sold (
    estate_id     BIGINT PRIMARY KEY,
    address       TEXT,
    zip_code      INT,
    city          TEXT,
    municipality  INT,
    price         BIGINT,
    sold_date     DATE,
    size          INT,
    rooms         NUMERIC(4,1),
    build_year    INT,
    sqm_price     NUMERIC(12,2),
    sale_type     TEXT,
    price_change  NUMERIC(8,4),
    scraped_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Daily aggregate snapshots for trend analysis
CREATE TABLE daily_snapshots (
    id               SERIAL PRIMARY KEY,
    snapshot_date    DATE NOT NULL,
    municipality     INT NOT NULL,
    active_count     INT,
    median_price     BIGINT,
    median_sqm_price NUMERIC(12,2),
    median_size      INT,
    new_listings     INT,
    delisted         INT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(snapshot_date, municipality)
);

-- Scrape run tracking: monitor our API footprint
CREATE TABLE scrape_runs (
    id               SERIAL PRIMARY KEY,
    run_type         TEXT NOT NULL,
    municipality     INT,
    started_at       TIMESTAMPTZ DEFAULT NOW(),
    finished_at      TIMESTAMPTZ,
    api_calls        INT DEFAULT 0,
    records_fetched  INT DEFAULT 0,
    records_upserted INT DEFAULT 0,
    last_page        INT,
    status           TEXT DEFAULT 'running',
    error_msg        TEXT
);

CREATE INDEX idx_listings_municipality ON listings(municipality);
CREATE INDEX idx_sold_municipality ON sold(municipality);
CREATE INDEX idx_sold_date ON sold(sold_date);
CREATE INDEX idx_sold_zip ON sold(zip_code);
