-- Client location confirmations.
--
-- A client opens their personal `/track?client=<phone>` link, the browser asks
-- for GPS, and the confirmed fix lands here. One row per confirmation, never
-- an upsert: "where was this client when they confirmed" is a history, and a
-- booking made last month and one made today are different places.
--
-- `client_id` is nullable on purpose. The link is sent to a phone number, and
-- that number may match nobody on file yet — a new client, a typo, or a number
-- saved locally as 0331-2721327 against a link carrying 923312721327. Making
-- the FK required would mean discarding exactly the captures a salon most
-- wants to see, so the raw identifier is kept in `client_ref` and the match is
-- recorded alongside it when one is found.
--
-- ON DELETE SET NULL for the same reason `staff_id` uses it on stock
-- movements: removing a client must not silently delete the trail.
--
-- Coordinates are NUMERIC(9,6), never double precision. Six decimal places is
-- ~0.1 m; a rounded coordinate is a different street, and float drift on a
-- value that is only ever stored and displayed buys nothing.

-- CreateTable
CREATE TABLE "client_locations" (
    "id" TEXT NOT NULL,
    "client_ref" TEXT NOT NULL,
    "client_id" TEXT,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "accuracy_m" INTEGER,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_locations_created_at_idx" ON "client_locations"("created_at");

-- CreateIndex
CREATE INDEX "client_locations_client_ref_created_at_idx" ON "client_locations"("client_ref", "created_at");

-- CreateIndex
CREATE INDEX "client_locations_client_id_idx" ON "client_locations"("client_id");

-- AddForeignKey
ALTER TABLE "client_locations" ADD CONSTRAINT "client_locations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
