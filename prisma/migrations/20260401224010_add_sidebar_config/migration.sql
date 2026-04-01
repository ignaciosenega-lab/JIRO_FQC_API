-- AlterTable
ALTER TABLE "OnoConfig" ADD COLUMN     "manualTopics" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "quickCategories" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "suggestedQueries" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "temperatureRef" TEXT NOT NULL DEFAULT '[]';
