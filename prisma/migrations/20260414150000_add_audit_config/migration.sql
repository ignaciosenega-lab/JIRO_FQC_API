-- CreateTable
CREATE TABLE "AuditConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "cocinaCategories" TEXT NOT NULL DEFAULT '[]',
    "cajasCategories" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditConfig_pkey" PRIMARY KEY ("id")
);
