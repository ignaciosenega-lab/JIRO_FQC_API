-- CreateTable
CREATE TABLE "Auto" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "nombre" TEXT NOT NULL DEFAULT '',
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notas" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Auto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoCuota" (
    "id" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fecha" TIMESTAMP(3) NOT NULL,
    "paidBy" TEXT NOT NULL DEFAULT 'nacho',
    "notas" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autoId" TEXT NOT NULL DEFAULT 'singleton',

    CONSTRAINT "AutoCuota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoCuota_autoId_idx" ON "AutoCuota"("autoId");

-- CreateIndex
CREATE INDEX "AutoCuota_fecha_idx" ON "AutoCuota"("fecha");

-- AddForeignKey
ALTER TABLE "AutoCuota" ADD CONSTRAINT "AutoCuota_autoId_fkey" FOREIGN KEY ("autoId") REFERENCES "Auto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
