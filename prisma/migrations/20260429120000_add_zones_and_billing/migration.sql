-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "provincia" TEXT NOT NULL DEFAULT '',
    "partidoComuna" TEXT NOT NULL DEFAULT '',
    "barrio" TEXT NOT NULL DEFAULT '',
    "poblacion" INTEGER NOT NULL DEFAULT 0,
    "densidadHabKm2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ingresoPromedio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "edadMediana" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nivelSocioeconomico" TEXT NOT NULL DEFAULT '',
    "oficinasCercanas" INTEGER NOT NULL DEFAULT 0,
    "competenciaSushi" INTEGER NOT NULL DEFAULT 0,
    "notas" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingData" (
    "id" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "ventasBrutas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transacciones" INTEGER NOT NULL DEFAULT 0,
    "ticketPromedio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notas" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "franchiseId" TEXT NOT NULL,

    CONSTRAINT "BillingData_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Franchise" ADD COLUMN "zoneId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Zone_provincia_partidoComuna_barrio_nombre_key" ON "Zone"("provincia", "partidoComuna", "barrio", "nombre");

-- CreateIndex
CREATE INDEX "BillingData_franchiseId_idx" ON "BillingData"("franchiseId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingData_franchiseId_periodo_key" ON "BillingData"("franchiseId", "periodo");

-- AddForeignKey
ALTER TABLE "Franchise" ADD CONSTRAINT "Franchise_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingData" ADD CONSTRAINT "BillingData_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
