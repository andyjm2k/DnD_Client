-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Character" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "portrait" TEXT,
    "race" TEXT NOT NULL,
    "class" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "background" TEXT NOT NULL,
    "alignment" TEXT NOT NULL,
    "strength" INTEGER NOT NULL,
    "dexterity" INTEGER NOT NULL,
    "constitution" INTEGER NOT NULL,
    "intelligence" INTEGER NOT NULL,
    "wisdom" INTEGER NOT NULL,
    "charisma" INTEGER NOT NULL,
    "maxHitPoints" INTEGER NOT NULL,
    "currentHitPoints" INTEGER NOT NULL,
    "armorClass" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'alive',
    "deathSavingThrowSuccesses" INTEGER NOT NULL DEFAULT 0,
    "deathSavingThrowFailures" INTEGER NOT NULL DEFAULT 0,
    "backstory" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Character" ("alignment", "armorClass", "background", "backstory", "charisma", "class", "constitution", "createdAt", "currentHitPoints", "dexterity", "id", "intelligence", "level", "maxHitPoints", "name", "portrait", "race", "strength", "updatedAt", "userId", "wisdom") SELECT "alignment", "armorClass", "background", "backstory", "charisma", "class", "constitution", "createdAt", "currentHitPoints", "dexterity", "id", "intelligence", "level", "maxHitPoints", "name", "portrait", "race", "strength", "updatedAt", "userId", "wisdom" FROM "Character";
DROP TABLE "Character";
ALTER TABLE "new_Character" RENAME TO "Character";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
