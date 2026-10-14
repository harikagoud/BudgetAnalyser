-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- DESTRUCTIVE for pre-auth data: rows created before login existed have no
-- owner, and Account.userId is now required. Anything entered before this
-- migration (single anonymous user) is removed rather than guessed at.
-- Global data (Category, SEED MerchantRule) is kept.
DELETE FROM "Transaction";
DELETE FROM "ImportBatch";
DELETE FROM "Account";
DELETE FROM "UserSetting";
DELETE FROM "MerchantRule" WHERE "source" = 'USER';

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "plaidItemId" TEXT,
    "accessTokenEncrypted" TEXT,
    "institutionName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" DATETIME,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("accessTokenEncrypted", "createdAt", "id", "institutionName", "lastSyncedAt", "name", "plaidItemId", "type") SELECT "accessTokenEncrypted", "createdAt", "id", "institutionName", "lastSyncedAt", "name", "plaidItemId", "type" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE TABLE "new_MerchantRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pattern" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MerchantRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MerchantRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MerchantRule" ("categoryId", "createdAt", "id", "pattern", "source") SELECT "categoryId", "createdAt", "id", "pattern", "source" FROM "MerchantRule";
DROP TABLE "MerchantRule";
ALTER TABLE "new_MerchantRule" RENAME TO "MerchantRule";
CREATE INDEX "MerchantRule_pattern_source_userId_idx" ON "MerchantRule"("pattern", "source", "userId");
CREATE TABLE "new_UserSetting" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    PRIMARY KEY ("userId", "key"),
    CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserSetting" ("key", "value") SELECT "key", "value" FROM "UserSetting";
DROP TABLE "UserSetting";
ALTER TABLE "new_UserSetting" RENAME TO "UserSetting";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

