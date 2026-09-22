-- Link opcional entre Opening y Franchise para scoping por rol FRANQUICIA.
ALTER TABLE "Opening" ADD COLUMN "franchiseId" TEXT;
CREATE INDEX "Opening_franchiseId_idx" ON "Opening"("franchiseId");
ALTER TABLE "Opening" ADD CONSTRAINT "Opening_franchiseId_fkey"
    FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE SET NULL ON UPDATE CASCADE;
