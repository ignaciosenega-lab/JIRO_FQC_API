-- Totales agregados de red por mes — se llenan sincronizando el tab
-- "Análisis Jiro" del Google Sheet. Alimenta los KPIs generales cuando
-- no tenemos desglose por local (SalesByChannel).

CREATE TABLE "SalesMonthlyTotal" (
    "id" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalesMonthlyTotal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalesMonthlyTotal_periodo_key" ON "SalesMonthlyTotal"("periodo");
CREATE INDEX "SalesMonthlyTotal_periodo_idx" ON "SalesMonthlyTotal"("periodo");
