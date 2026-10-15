-- One-time setup for an EMPTY Neon database, for use in Neon's web SQL Editor
-- (when port 5432 is blocked on your network). Part 1 = schema, Part 2 = default data.
-- Run once. Do not re-run on a database that already has tables.

-- ===== Part 1: schema (prisma/migrations/20261014120000_init_postgres) =====

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "plaidItemId" TEXT,
    "accessTokenEncrypted" TEXT,
    "institutionName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "merchantRaw" TEXT NOT NULL,
    "merchantNormalized" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "categorySource" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDiscretionary" BOOLEAN NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantRule" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSetting" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "UserSetting_pkey" PRIMARY KEY ("userId","key")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "transactionCount" INTEGER NOT NULL,
    "duplicateCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_dedupeKey_key" ON "Transaction"("dedupeKey");

-- CreateIndex
CREATE INDEX "Transaction_accountId_date_idx" ON "Transaction"("accountId", "date");

-- CreateIndex
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE INDEX "MerchantRule_pattern_source_userId_idx" ON "MerchantRule"("pattern", "source", "userId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantRule" ADD CONSTRAINT "MerchantRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantRule" ADD CONSTRAINT "MerchantRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSetting" ADD CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===== Part 2: default categories + merchant rules =====
INSERT INTO "Category" ("id","name","isDiscretionary","isDefault") VALUES ('cmv8bqoi90003uu2xjwqif1yz','Car Insurance',false,true);
INSERT INTO "Category" ("id","name","isDiscretionary","isDefault") VALUES ('cmv8bqoi60002uu2xzbe6am2n','Dining',true,true);
INSERT INTO "Category" ("id","name","isDiscretionary","isDefault") VALUES ('cmv8bqoi50001uu2xgzkqg2fa','Groceries',false,true);
INSERT INTO "Category" ("id","name","isDiscretionary","isDefault") VALUES ('cmv8bqoic0004uu2x7xh9hwbo','Home/EMI',false,true);
INSERT INTO "Category" ("id","name","isDiscretionary","isDefault") VALUES ('cmv8bqohz0000uu2xmhts8lax','Subscriptions',true,true);
INSERT INTO "Category" ("id","name","isDiscretionary","isDefault") VALUES ('cmv8bqoii0007uu2xynhbix7z','Uncategorized',false,true);
INSERT INTO "Category" ("id","name","isDiscretionary","isDefault") VALUES ('cmv8bqoih0006uu2x5ygggtei','Utilities',false,true);
INSERT INTO "Category" ("id","name","isDiscretionary","isDefault") VALUES ('cmv8bqoif0005uu2xchkwec5m','Vacations/Travel',true,true);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqokx001puu2xln3ec21j','airbnb','cmv8bqoif0005uu2xchkwec5m','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqokm001fuu2xbzsbaxa3','allstate','cmv8bqoi90003uu2xjwqif1yz','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqojj000vuu2xsskjngb1','amazon prime','cmv8bqohz0000uu2xmhts8lax','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqojv0015uu2xye2hlgso','chipotle','cmv8bqoi60002uu2xzbe6am2n','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqoim0009uu2xgvs6agz4','costco','cmv8bqoi50001uu2xgzkqg2fa','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqokz001ruu2xvp4bqn3d','delta air','cmv8bqoif0005uu2xchkwec5m','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqojf000tuu2x8jwlblui','disney+','cmv8bqohz0000uu2xmhts8lax','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqojo000zuu2x10egfg6y','doordash','cmv8bqoi60002uu2xzbe6am2n','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqol4001vuu2xuvkqv7hm','electric','cmv8bqoih0006uu2x5ygggtei','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqokt001luu2x4ekfwcaa','emi payment','cmv8bqoic0004uu2x7xh9hwbo','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqokv001nuu2x1lr4rhkt','expedia','cmv8bqoif0005uu2xchkwec5m','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqole001zuu2x5hq859qh','gas company','cmv8bqoih0006uu2x5ygggtei','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqok70019uu2xs9ok53ff','geico','cmv8bqoi90003uu2xjwqif1yz','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqokr001juu2x523q88ja','home loan','cmv8bqoic0004uu2x7xh9hwbo','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqojc000ruu2xfdjpozik','hulu','cmv8bqohz0000uu2xmhts8lax','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqojl000xuu2x4kd2dyln','icloud','cmv8bqohz0000uu2xmhts8lax','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqoll0021uu2xnd94uq30','internet service','cmv8bqoih0006uu2x5ygggtei','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqoiw000fuu2xjex77b0a','kroger','cmv8bqoi50001uu2xgzkqg2fa','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqol1001tuu2xrbw1xae7','marriott','cmv8bqoif0005uu2xchkwec5m','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqojx0017uu2xx6xrweky','mcdonald','cmv8bqoi60002uu2xzbe6am2n','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqoko001huu2x67f2cepg','mortgage','cmv8bqoic0004uu2x7xh9hwbo','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqoj6000nuu2xvsci43yj','netflix','cmv8bqohz0000uu2xmhts8lax','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqokf001buu2xcthv2cua','progressive','cmv8bqoi90003uu2xjwqif1yz','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqoj4000luu2xrqzxkpsn','safeway','cmv8bqoi50001uu2xgzkqg2fa','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqoj9000puu2xll5db5ya','spotify','cmv8bqohz0000uu2xmhts8lax','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqojs0013uu2xkeazcqs6','starbucks','cmv8bqoi60002uu2xzbe6am2n','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqokk001duu2xcsqw09ui','state farm','cmv8bqoi90003uu2xjwqif1yz','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqoiy000huu2xczq9sdsu','trader joe','cmv8bqoi50001uu2xgzkqg2fa','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqojq0011uu2x6ww17k9g','uber eats','cmv8bqoi60002uu2xzbe6am2n','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqoir000buu2xb62zsx6q','wal-mart','cmv8bqoi50001uu2xgzkqg2fa','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqoit000duu2x8s5fn8bs','walmart','cmv8bqoi50001uu2xgzkqg2fa','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqol8001xuu2x7317d1t8','water utility','cmv8bqoih0006uu2x5ygggtei','SEED',NULL);
INSERT INTO "MerchantRule" ("id","pattern","categoryId","source","userId") VALUES ('cmv8bqoj1000juu2x1ovh6ghh','whole foods','cmv8bqoi50001uu2xgzkqg2fa','SEED',NULL);

-- ===== Part 3: email verification column (migration 20261014180000_add_email_verification) =====
-- If you already ran Parts 1-2 earlier, run ONLY these two statements.
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
UPDATE "User" SET "emailVerifiedAt" = "createdAt";

-- ===== Part 4: budget limits (migration 20261015120000_add_budget_limits) =====
-- If Parts 1-3 are already applied, run ONLY this part.
CREATE TABLE "BudgetLimit" (
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetLimit_pkey" PRIMARY KEY ("userId","categoryId")
);

ALTER TABLE "BudgetLimit" ADD CONSTRAINT "BudgetLimit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BudgetLimit" ADD CONSTRAINT "BudgetLimit_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

