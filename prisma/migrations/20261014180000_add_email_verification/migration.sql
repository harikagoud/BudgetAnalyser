-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Accounts that exist when this ships predate verification: treat them as verified
-- so existing test users are not locked out. New sign-ups start with NULL.
UPDATE "User" SET "emailVerifiedAt" = "createdAt";
