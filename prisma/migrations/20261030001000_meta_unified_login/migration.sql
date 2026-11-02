ALTER TYPE "InstagramProvider" ADD VALUE 'UNIFIED';

ALTER TABLE "InstagramAccount"
  ADD COLUMN "clientBusinessId" TEXT,
  ADD COLUMN "metaLoginConfigId" TEXT;
