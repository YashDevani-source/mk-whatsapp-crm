-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageFailureReason" AS ENUM ('WA_NOT_CONNECTED', 'PROVIDER_ERROR', 'REPORTED_FAILED');

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "last_message_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "body" TEXT,
ADD COLUMN     "client_id" UUID,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "failure_reason" "MessageFailureReason",
ADD COLUMN     "sent_by_id" UUID,
ADD COLUMN     "status" "MessageStatus",
ADD COLUMN     "status_at" TIMESTAMP(3),
ADD COLUMN     "type" "MessageType" NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "unsupported_kind" TEXT;

-- CreateIndex
CREATE INDEX "conversations_last_message_at_idx" ON "conversations"("last_message_at");

-- CreateIndex
CREATE INDEX "messages_conversation_id_at_idx" ON "messages"("conversation_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_client_id_key" ON "messages"("conversation_id", "client_id");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

