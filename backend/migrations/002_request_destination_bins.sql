-- PostgreSQL; apply after 001, before starting the updated API.
BEGIN;
ALTER TABLE pickup_requests ADD COLUMN IF NOT EXISTS destination_bin_id INTEGER REFERENCES bins(id);
ALTER TABLE pickup_requests ADD COLUMN IF NOT EXISTS waste_volume_liters DOUBLE PRECISION;
-- Historical requests retain null destination/volume and do not affect bin fill.
UPDATE bins SET status = 'active' WHERE status = 'full' AND fill_level < 100;
COMMIT;
