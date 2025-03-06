-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AIDungeonMaster" (
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
    CONSTRAINT "AIDungeonMaster_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AIDungeonMaster" ("campaignId", "contextWindow", "createdAt", "difficulty", "id", "model", "personality", "rulesEnforcement", "style", "systemPrompt", "temperature", "updatedAt") SELECT "campaignId", "contextWindow", "createdAt", "difficulty", "id", "model", "personality", "rulesEnforcement", "style", "systemPrompt", "temperature", "updatedAt" FROM "AIDungeonMaster";
DROP TABLE "AIDungeonMaster";
ALTER TABLE "new_AIDungeonMaster" RENAME TO "AIDungeonMaster";
CREATE UNIQUE INDEX "AIDungeonMaster_campaignId_key" ON "AIDungeonMaster"("campaignId");
CREATE TABLE "new_Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
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
    "playerId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    CONSTRAINT "Campaign_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Campaign_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Campaign" ("characterId", "createdAt", "currentLocation", "currentQuest", "description", "id", "locationDesc", "objectives", "playerId", "questDesc", "setting", "status", "systemPrompt", "title", "tone", "updatedAt") SELECT "characterId", "createdAt", "currentLocation", "currentQuest", "description", "id", "locationDesc", "objectives", "playerId", "questDesc", "setting", "status", "systemPrompt", "title", "tone", "updatedAt" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
CREATE TABLE "new_CampaignPlayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignPlayer_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CampaignPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CampaignPlayer_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CampaignPlayer" ("campaignId", "characterId", "id", "joinedAt", "userId") SELECT "campaignId", "characterId", "id", "joinedAt", "userId" FROM "CampaignPlayer";
DROP TABLE "CampaignPlayer";
ALTER TABLE "new_CampaignPlayer" RENAME TO "CampaignPlayer";
CREATE TABLE "new_CharacterProficiency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "CharacterProficiency_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CharacterProficiency" ("characterId", "id", "name", "type") SELECT "characterId", "id", "name", "type" FROM "CharacterProficiency";
DROP TABLE "CharacterProficiency";
ALTER TABLE "new_CharacterProficiency" RENAME TO "CharacterProficiency";
CREATE TABLE "new_ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "speaker" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataStr" TEXT,
    CONSTRAINT "ChatMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ChatMessage" ("campaignId", "id", "message", "metadataStr", "speaker", "timestamp", "type") SELECT "campaignId", "id", "message", "metadataStr", "speaker", "timestamp", "type" FROM "ChatMessage";
DROP TABLE "ChatMessage";
ALTER TABLE "new_ChatMessage" RENAME TO "ChatMessage";
CREATE TABLE "new_Equipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "Equipment_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Equipment" ("characterId", "id", "item", "quantity") SELECT "characterId", "id", "item", "quantity" FROM "Equipment";
DROP TABLE "Equipment";
ALTER TABLE "new_Equipment" RENAME TO "Equipment";
CREATE TABLE "new_Feature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    CONSTRAINT "Feature_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Feature" ("characterId", "description", "id", "name", "source") SELECT "characterId", "description", "id", "name", "source" FROM "Feature";
DROP TABLE "Feature";
ALTER TABLE "new_Feature" RENAME TO "Feature";
CREATE TABLE "new_GameState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "currentScene" TEXT,
    "lastAction" TEXT,
    "combatActive" BOOLEAN NOT NULL DEFAULT false,
    "initiativeOrder" TEXT,
    CONSTRAINT "GameState_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GameState" ("campaignId", "combatActive", "currentScene", "id", "initiativeOrder", "lastAction") SELECT "campaignId", "combatActive", "currentScene", "id", "initiativeOrder", "lastAction" FROM "GameState";
DROP TABLE "GameState";
ALTER TABLE "new_GameState" RENAME TO "GameState";
CREATE UNIQUE INDEX "GameState_campaignId_key" ON "GameState"("campaignId");
CREATE TABLE "new_NPC" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    CONSTRAINT "NPC_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NPC" ("campaignId", "description", "id", "location", "name", "role") SELECT "campaignId", "description", "id", "location", "name", "role" FROM "NPC";
DROP TABLE "NPC";
ALTER TABLE "new_NPC" RENAME TO "NPC";
CREATE TABLE "new_Spell" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    CONSTRAINT "Spell_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Spell" ("characterId", "description", "id", "level", "name") SELECT "characterId", "description", "id", "level", "name" FROM "Spell";
DROP TABLE "Spell";
ALTER TABLE "new_Spell" RENAME TO "Spell";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
