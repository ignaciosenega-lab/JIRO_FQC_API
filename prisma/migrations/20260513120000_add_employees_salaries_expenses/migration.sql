-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Salary" (
    "id" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "blancoAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "negroAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "presentismoAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "presentismoPaidBy" TEXT NOT NULL DEFAULT 'nacho',
    "pagado" BOOLEAN NOT NULL DEFAULT false,
    "notas" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "employeeId" TEXT NOT NULL,

    CONSTRAINT "Salary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtherExpense" (
    "id" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidBy" TEXT NOT NULL DEFAULT 'nacho',
    "pagado" BOOLEAN NOT NULL DEFAULT false,
    "notas" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtherExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Salary_employeeId_idx" ON "Salary"("employeeId");

-- CreateIndex
CREATE INDEX "Salary_periodo_idx" ON "Salary"("periodo");

-- CreateIndex
CREATE UNIQUE INDEX "Salary_employeeId_periodo_key" ON "Salary"("employeeId", "periodo");

-- CreateIndex
CREATE INDEX "OtherExpense_periodo_idx" ON "OtherExpense"("periodo");

-- AddForeignKey
ALTER TABLE "Salary" ADD CONSTRAINT "Salary_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
