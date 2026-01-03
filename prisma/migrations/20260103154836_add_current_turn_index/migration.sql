-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GameState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "currentScene" TEXT,
    "lastAction" TEXT,
    "combatActive" BOOLEAN NOT NULL DEFAULT false,
    "initiativeOrder" TEXT,
    "currentTurnIndex" INTEGER,
    CONSTRAINT "GameState_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GameState" ("campaignId", "combatActive", "currentScene", "id", "initiativeOrder", "lastAction") SELECT "campaignId", "combatActive", "currentScene", "id", "initiativeOrder", "lastAction" FROM "GameState";
DROP TABLE "GameState";
ALTER TABLE "new_GameState" RENAME TO "GameState";
CREATE UNIQUE INDEX "GameState_campaignId_key" ON "GameState"("campaignId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

