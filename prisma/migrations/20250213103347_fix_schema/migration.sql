/*
  Warnings:

  - You are about to drop the column `difficulty` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `dungeonMasterId` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `model` on the `Campaign` table. All the data in the column will be lost.
  - Added the required column `characterId` to the `Campaign` table without a default value. This is not possible if the table is not empty.
  - Added the required column `playerId` to the `Campaign` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "metadataStr" TEXT;

-- CreateTable
CREATE TABLE "AIDungeonMaster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'gpt-4',
    "temperature" REAL NOT NULL DEFAULT 0.7,
    "personality" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "systemPrompt" TEXT NOT NULL,
    "contextWindow" INTEGER NOT NULL DEFAULT 5,
    "rulesEnforcement" TEXT NOT NULL DEFAULT 'moderate',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AIDungeonMaster_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "setting" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL DEFAULT 'You are a D&D 5E Dungeon Master helping to test the system. Keep responses brief but helpful.',
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentLocation" TEXT,
    "locationDesc" TEXT,
    "currentQuest" TEXT,
    "questDesc" TEXT,
    "objectives" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "characterId" TEXT NOT NULL,
    CONSTRAINT "Campaign_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Campaign_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Campaign" ("createdAt", "currentLocation", "currentQuest", "description", "id", "locationDesc", "objectives", "questDesc", "setting", "status", "systemPrompt", "title", "tone", "updatedAt") SELECT "createdAt", "currentLocation", "currentQuest", "description", "id", "locationDesc", "objectives", "questDesc", "setting", "status", "systemPrompt", "title", "tone", "updatedAt" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "AIDungeonMaster_campaignId_key" ON "AIDungeonMaster"("campaignId");
