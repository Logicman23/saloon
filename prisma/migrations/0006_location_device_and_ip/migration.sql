-- Approximate location from the request IP, plus the device that made it.
--
-- Changes the shape of a capture. Until now a row existed only because a
-- client granted GPS; from here a row is written the moment the tracking page
-- loads, carrying whatever the IP address and the browser will say, and GPS
-- later sharpens that same row rather than adding a second one.
--
-- Three consequences the columns below encode:
--
--   * `location_type` is not decoration. An IP fix on a mobile network can
--     resolve to a carrier gateway in a different city, so a reader who cannot
--     tell an approximate row from a precise one will eventually drive to the
--     wrong address. Existing rows all came from GPS, so they backfill to
--     GPS_PRECISE.
--
--   * latitude/longitude become NULLABLE. The IP lookup can fail or return
--     nothing useful, and the device and network detail is still worth keeping
--     when it does.
--
--   * `ip` becomes `ip_address`. Same column, renamed to sit with the other
--     network fields rather than read as leftover request provenance.

-- CreateEnum
CREATE TYPE "LocationSource" AS ENUM ('IP_APPROX', 'GPS_PRECISE');

-- AlterTable: coordinates are no longer guaranteed
ALTER TABLE "client_locations" ALTER COLUMN "latitude" DROP NOT NULL;
ALTER TABLE "client_locations" ALTER COLUMN "longitude" DROP NOT NULL;

-- AlterTable: rename rather than add-and-copy, so no row carries the address twice
ALTER TABLE "client_locations" RENAME COLUMN "ip" TO "ip_address";

-- AlterTable: IP-derived location
ALTER TABLE "client_locations" ADD COLUMN "city" TEXT;
ALTER TABLE "client_locations" ADD COLUMN "region" TEXT;
ALTER TABLE "client_locations" ADD COLUMN "country" TEXT;
ALTER TABLE "client_locations" ADD COLUMN "isp" TEXT;

-- AlterTable: device and browser, as self-reported by the client
ALTER TABLE "client_locations" ADD COLUMN "device_type" TEXT;
ALTER TABLE "client_locations" ADD COLUMN "os" TEXT;
ALTER TABLE "client_locations" ADD COLUMN "browser" TEXT;
ALTER TABLE "client_locations" ADD COLUMN "device_model" TEXT;
ALTER TABLE "client_locations" ADD COLUMN "screen_resolution" TEXT;

-- AlterTable: provenance of the coordinates.
--
-- Added nullable, backfilled, then made NOT NULL without a default. A default
-- would be the wrong shape going forward: every new row genuinely knows which
-- of the two it is, and a default silently mislabels the one that forgets.
ALTER TABLE "client_locations" ADD COLUMN "location_type" "LocationSource";
UPDATE "client_locations" SET "location_type" = 'GPS_PRECISE' WHERE "location_type" IS NULL;
ALTER TABLE "client_locations" ALTER COLUMN "location_type" SET NOT NULL;

-- CreateIndex
CREATE INDEX "client_locations_location_type_idx" ON "client_locations"("location_type");
