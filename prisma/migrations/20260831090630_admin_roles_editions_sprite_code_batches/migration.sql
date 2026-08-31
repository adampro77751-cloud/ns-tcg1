/*
  Warnings:

  - Added the required column `batchId` to the `RedemptionCode` table without a default value. This is not possible if the table is not empty.
  - Added the required column `editionId` to the `RedemptionCode` table without a default value. This is not possible if the table is not empty.
  - Added the required column `editionId` to the `UserSprite` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Edition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SpriteCodeBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spriteId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpriteCodeBatch_spriteId_fkey" FOREIGN KEY ("spriteId") REFERENCES "Sprite" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SpriteCodeBatch_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SpriteCodeBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RedemptionCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "spriteId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "redeemed" BOOLEAN NOT NULL DEFAULT false,
    "redeemedById" TEXT,
    "redeemedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RedemptionCode_spriteId_fkey" FOREIGN KEY ("spriteId") REFERENCES "Sprite" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RedemptionCode_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RedemptionCode_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SpriteCodeBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RedemptionCode_redeemedById_fkey" FOREIGN KEY ("redeemedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RedemptionCode" ("code", "createdAt", "id", "redeemed", "redeemedAt", "redeemedById", "spriteId") SELECT "code", "createdAt", "id", "redeemed", "redeemedAt", "redeemedById", "spriteId" FROM "RedemptionCode";
DROP TABLE "RedemptionCode";
ALTER TABLE "new_RedemptionCode" RENAME TO "RedemptionCode";
CREATE UNIQUE INDEX "RedemptionCode_code_key" ON "RedemptionCode"("code");
CREATE INDEX "RedemptionCode_redeemedById_idx" ON "RedemptionCode"("redeemedById");
CREATE INDEX "RedemptionCode_batchId_idx" ON "RedemptionCode"("batchId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "email", "id", "passwordHash", "updatedAt", "username") SELECT "createdAt", "email", "id", "passwordHash", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE TABLE "new_UserSprite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "spriteId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "obtainedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserSprite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserSprite_spriteId_fkey" FOREIGN KEY ("spriteId") REFERENCES "Sprite" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserSprite_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_UserSprite" ("id", "obtainedAt", "quantity", "spriteId", "userId") SELECT "id", "obtainedAt", "quantity", "spriteId", "userId" FROM "UserSprite";
DROP TABLE "UserSprite";
ALTER TABLE "new_UserSprite" RENAME TO "UserSprite";
CREATE INDEX "UserSprite_userId_idx" ON "UserSprite"("userId");
CREATE UNIQUE INDEX "UserSprite_userId_spriteId_editionId_key" ON "UserSprite"("userId", "spriteId", "editionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Edition_name_key" ON "Edition"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Edition_slug_key" ON "Edition"("slug");

-- CreateIndex
CREATE INDEX "SpriteCodeBatch_createdById_idx" ON "SpriteCodeBatch"("createdById");
