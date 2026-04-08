-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "turno" TEXT NOT NULL,
    "tipoAuditoria" TEXT NOT NULL,
    "localNotificado" TEXT NOT NULL DEFAULT '',
    "cocinaScores" TEXT NOT NULL DEFAULT '{}',
    "cajasScores" TEXT NOT NULL DEFAULT '{}',
    "cocinaTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cocinaMax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cajasTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cajasMax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cocinaPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cajasPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hallazgosCocina" TEXT NOT NULL DEFAULT '',
    "hallazgosCaja" TEXT NOT NULL DEFAULT '',
    "accionesCorrectivas" TEXT NOT NULL DEFAULT '',
    "nivelUrgencia" TEXT NOT NULL DEFAULT '',
    "localObservado" TEXT NOT NULL DEFAULT '',
    "observaciones" TEXT NOT NULL DEFAULT '',
    "firmaResponsable" TEXT NOT NULL DEFAULT '',
    "firmaConsultor" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "franchiseId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
