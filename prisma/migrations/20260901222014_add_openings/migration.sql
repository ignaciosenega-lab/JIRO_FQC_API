-- Módulo Aperturas: catálogo de templates + locales en apertura + tareas
-- concretas por local (con snapshot para que un renombre de template no rompa
-- historia).

-- CreateTable OpeningTaskTemplate
CREATE TABLE "OpeningTaskTemplate" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "tarea" TEXT NOT NULL,
    "categoria" TEXT,
    "semana" TEXT,
    "responsableSugerido" TEXT,
    "diasEstimados" INTEGER,
    "notas" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpeningTaskTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OpeningTaskTemplate_mode_idx" ON "OpeningTaskTemplate"("mode");
CREATE INDEX "OpeningTaskTemplate_grupo_idx" ON "OpeningTaskTemplate"("grupo");

-- CreateTable Opening
CREATE TABLE "Opening" (
    "id" TEXT NOT NULL,
    "localName" TEXT NOT NULL,
    "zona" TEXT NOT NULL DEFAULT '',
    "franquiciado" TEXT NOT NULL DEFAULT '',
    "respOperacionesId" TEXT,
    "respMarketingId" TEXT,
    "fechaObjetivoApertura" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'en_curso',
    "notas" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opening_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Opening_status_idx" ON "Opening"("status");
CREATE INDEX "Opening_fechaObjetivoApertura_idx" ON "Opening"("fechaObjetivoApertura");

ALTER TABLE "Opening" ADD CONSTRAINT "Opening_respOperacionesId_fkey"
    FOREIGN KEY ("respOperacionesId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Opening" ADD CONSTRAINT "Opening_respMarketingId_fkey"
    FOREIGN KEY ("respMarketingId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable OpeningTask
CREATE TABLE "OpeningTask" (
    "id" TEXT NOT NULL,
    "openingId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateTitulo" TEXT NOT NULL,
    "categoria" TEXT,
    "semana" TEXT,
    "grupo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "diasEstimados" INTEGER,
    "notas" TEXT NOT NULL DEFAULT '',
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "fechaInicio" TIMESTAMP(3),
    "fechaCompletada" TIMESTAMP(3),
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpeningTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OpeningTask_openingId_idx" ON "OpeningTask"("openingId");
CREATE INDEX "OpeningTask_estado_idx" ON "OpeningTask"("estado");
CREATE INDEX "OpeningTask_assignedToId_idx" ON "OpeningTask"("assignedToId");
CREATE INDEX "OpeningTask_mode_idx" ON "OpeningTask"("mode");

ALTER TABLE "OpeningTask" ADD CONSTRAINT "OpeningTask_openingId_fkey"
    FOREIGN KEY ("openingId") REFERENCES "Opening"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OpeningTask" ADD CONSTRAINT "OpeningTask_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
