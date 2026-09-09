-- Alertas automáticas sobre performance de local.
CREATE TABLE "SalesAlert" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "franchiseId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "localRevenue" DOUBLE PRECISION,
    "othersRevenue" DOUBLE PRECISION,
    "ticketLocal" DOUBLE PRECISION,
    "ticketNetwork" DOUBLE PRECISION,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "dismissedAt" TIMESTAMP(3),
    "dismissedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalesAlert_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalesAlert_type_franchiseId_periodo_key" ON "SalesAlert"("type", "franchiseId", "periodo");
CREATE INDEX "SalesAlert_dismissed_idx" ON "SalesAlert"("dismissed");
CREATE INDEX "SalesAlert_periodo_idx" ON "SalesAlert"("periodo");

ALTER TABLE "SalesAlert" ADD CONSTRAINT "SalesAlert_franchiseId_fkey"
    FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
