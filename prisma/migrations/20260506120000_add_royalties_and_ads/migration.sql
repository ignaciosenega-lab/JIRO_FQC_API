-- CreateTable
CREATE TABLE "Royalty" (
    "id" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baseFacturacion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "porcentaje" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "notas" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "franchiseId" TEXT NOT NULL,

    CONSTRAINT "Royalty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdIncome" (
    "id" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baseFacturacion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "porcentaje" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "notas" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "franchiseId" TEXT NOT NULL,

    CONSTRAINT "AdIncome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Royalty_franchiseId_idx" ON "Royalty"("franchiseId");

-- CreateIndex
CREATE UNIQUE INDEX "Royalty_franchiseId_periodo_key" ON "Royalty"("franchiseId", "periodo");

-- CreateIndex
CREATE INDEX "AdIncome_franchiseId_idx" ON "AdIncome"("franchiseId");

-- CreateIndex
CREATE UNIQUE INDEX "AdIncome_franchiseId_periodo_key" ON "AdIncome"("franchiseId", "periodo");

-- AddForeignKey
ALTER TABLE "Royalty" ADD CONSTRAINT "Royalty_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdIncome" ADD CONSTRAINT "AdIncome_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
