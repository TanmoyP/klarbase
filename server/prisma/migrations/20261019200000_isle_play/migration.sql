-- Anonymous per-isle play counters (decision K7). No user data: no user id, no IP, no cookie.
-- CreateTable
CREATE TABLE "IslePlay" (
    "isleKey" TEXT NOT NULL,
    "started" INTEGER NOT NULL DEFAULT 0,
    "cleared" INTEGER NOT NULL DEFAULT 0,
    "hints" INTEGER NOT NULL DEFAULT 0,
    "restarts" INTEGER NOT NULL DEFAULT 0,
    "moves" JSONB NOT NULL DEFAULT '{}',
    "times" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IslePlay_pkey" PRIMARY KEY ("isleKey")
);
