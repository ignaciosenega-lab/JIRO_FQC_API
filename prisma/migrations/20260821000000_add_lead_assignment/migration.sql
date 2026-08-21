-- User: toggle "recibe leads" + peso relativo del reparto ponderado.
ALTER TABLE "User" ADD COLUMN "receivesLeads" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "leadWeight" INTEGER NOT NULL DEFAULT 1;

-- FranchiseLead: vendedor asignado (null = sin asignar).
ALTER TABLE "FranchiseLead" ADD COLUMN "assignedToId" TEXT;

-- CreateIndex
CREATE INDEX "FranchiseLead_assignedToId_idx" ON "FranchiseLead"("assignedToId");

-- AddForeignKey
ALTER TABLE "FranchiseLead" ADD CONSTRAINT "FranchiseLead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
