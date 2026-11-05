-- Atribución de origen para FranchiseLead.
-- Capturados en la landing desde los query params del visitante.

ALTER TABLE "FranchiseLead"
  ADD COLUMN "utmSource" TEXT,
  ADD COLUMN "utmMedium" TEXT,
  ADD COLUMN "utmCampaign" TEXT,
  ADD COLUMN "utmContent" TEXT,
  ADD COLUMN "utmTerm" TEXT,
  ADD COLUMN "gclid" TEXT,
  ADD COLUMN "fbclid" TEXT,
  ADD COLUMN "referrer" TEXT,
  ADD COLUMN "landingPath" TEXT;

CREATE INDEX "FranchiseLead_utmSource_idx" ON "FranchiseLead"("utmSource");
