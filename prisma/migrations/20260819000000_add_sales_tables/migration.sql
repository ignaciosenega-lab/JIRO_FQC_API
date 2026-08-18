-- CreateTable
CREATE TABLE "SalesByChannel" (
    "id" TEXT NOT NULL,
    "franchiseId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesByChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesWeekday" (
    "id" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "weekday" TEXT NOT NULL,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesWeekday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesByChannel_periodo_idx" ON "SalesByChannel"("periodo");

-- CreateIndex
CREATE INDEX "SalesByChannel_franchiseId_idx" ON "SalesByChannel"("franchiseId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesByChannel_franchiseId_periodo_channel_key" ON "SalesByChannel"("franchiseId", "periodo", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "SalesWeekday_periodo_weekday_key" ON "SalesWeekday"("periodo", "weekday");

-- AddForeignKey
ALTER TABLE "SalesByChannel" ADD CONSTRAINT "SalesByChannel_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
