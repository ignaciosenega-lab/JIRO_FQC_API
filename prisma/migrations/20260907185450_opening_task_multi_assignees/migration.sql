-- Multi-assign para OpeningTask: una tarea puede tener N responsables
-- (ej. "Yosue y Lean" o "Yosue y Franquiciado"). Reemplaza la columna
-- assignedToId (1 solo user) por una tabla pivot OpeningTaskAssignee.

-- 1) Crear la tabla pivot.
CREATE TABLE "OpeningTaskAssignee" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpeningTaskAssignee_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OpeningTaskAssignee_taskId_userId_key" ON "OpeningTaskAssignee"("taskId", "userId");
CREATE INDEX "OpeningTaskAssignee_taskId_idx" ON "OpeningTaskAssignee"("taskId");
CREATE INDEX "OpeningTaskAssignee_userId_idx" ON "OpeningTaskAssignee"("userId");

ALTER TABLE "OpeningTaskAssignee" ADD CONSTRAINT "OpeningTaskAssignee_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "OpeningTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpeningTaskAssignee" ADD CONSTRAINT "OpeningTaskAssignee_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Migrar datos existentes: cada OpeningTask con assignedToId != NULL crea
--    una entrada en la pivot. Uso md5(random+clock+taskId) para generar un id
--    determinístico-suficiente sin depender de la extensión pgcrypto.
INSERT INTO "OpeningTaskAssignee" ("id", "taskId", "userId", "createdAt")
SELECT
    'c' || substring(md5(random()::text || clock_timestamp()::text || t.id) from 1 for 24),
    t.id,
    t."assignedToId",
    CURRENT_TIMESTAMP
FROM "OpeningTask" t
WHERE t."assignedToId" IS NOT NULL;

-- 3) Eliminar la FK vieja y la columna assignedToId.
ALTER TABLE "OpeningTask" DROP CONSTRAINT IF EXISTS "OpeningTask_assignedToId_fkey";
DROP INDEX IF EXISTS "OpeningTask_assignedToId_idx";
ALTER TABLE "OpeningTask" DROP COLUMN "assignedToId";
