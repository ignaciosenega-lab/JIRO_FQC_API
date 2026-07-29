-- CreateTable
CREATE TABLE "FranchiseLead" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefono" TEXT NOT NULL DEFAULT '',
    "ciudad" TEXT NOT NULL DEFAULT '',
    "mensaje" TEXT NOT NULL DEFAULT '',
    "estado" TEXT NOT NULL DEFAULT 'nuevo',
    "notas" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FranchiseLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FranchiseLead_estado_idx" ON "FranchiseLead"("estado");

-- CreateIndex
CREATE INDEX "FranchiseLead_createdAt_idx" ON "FranchiseLead"("createdAt");
