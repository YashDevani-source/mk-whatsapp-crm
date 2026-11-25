-- CreateEnum
CREATE TYPE "WhatsAppProvider" AS ENUM ('FAKE', 'BAILEYS');

-- AlterTable
ALTER TABLE "whatsapp_sessions" ADD COLUMN     "provider" "WhatsAppProvider" NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "number" DROP NOT NULL;

-- CreateTable
CREATE TABLE "whatsapp_session_keys" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "key_id" TEXT NOT NULL,
    "encrypted_value" TEXT NOT NULL,

    CONSTRAINT "whatsapp_session_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_session_keys_session_id_type_key_id_key" ON "whatsapp_session_keys"("session_id", "type", "key_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_sessions_provider_key" ON "whatsapp_sessions"("provider");

-- AddForeignKey
ALTER TABLE "whatsapp_session_keys" ADD CONSTRAINT "whatsapp_session_keys_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "whatsapp_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

