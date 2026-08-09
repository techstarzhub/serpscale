-- Add a human-friendly sequential ticket number (SERIAL backs Prisma's Int @default(autoincrement()))
ALTER TABLE "SupportTicket" ADD COLUMN "number" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_number_key" ON "SupportTicket"("number");
