-- CreateTable
CREATE TABLE "RolePermissionsConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "permissions" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermissionsConfig_pkey" PRIMARY KEY ("id")
);
