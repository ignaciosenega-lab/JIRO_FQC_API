-- CreateTable
CREATE TABLE "MarketAnalysis" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "radiusKm" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "rubro" TEXT NOT NULL DEFAULT 'sushi delivery/takeaway',
    "inputContext" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT 'both',
    "reportMarkdown" TEXT NOT NULL DEFAULT '',
    "reportMarkdownAlt" TEXT NOT NULL DEFAULT '',
    "citations" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketAnalysis_createdById_idx" ON "MarketAnalysis"("createdById");

-- CreateIndex
CREATE INDEX "MarketAnalysis_createdAt_idx" ON "MarketAnalysis"("createdAt");

-- AddForeignKey
ALTER TABLE "MarketAnalysis" ADD CONSTRAINT "MarketAnalysis_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
