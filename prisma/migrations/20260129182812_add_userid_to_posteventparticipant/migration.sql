-- CreateTable
CREATE TABLE "PostEventParticipant" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostEventParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostEventExpense" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostEventExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostEventExpenseShare" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "shareAmount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "PostEventExpenseShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostEventParticipant_eventId_userId_key" ON "PostEventParticipant"("eventId", "userId");

-- CreateIndex
CREATE INDEX "PostEventExpenseShare_participantId_idx" ON "PostEventExpenseShare"("participantId");

-- CreateIndex
CREATE INDEX "PostEventExpenseShare_expenseId_idx" ON "PostEventExpenseShare"("expenseId");

-- AddForeignKey
ALTER TABLE "PostEventParticipant" ADD CONSTRAINT "PostEventParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostEventParticipant" ADD CONSTRAINT "PostEventParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostEventExpense" ADD CONSTRAINT "PostEventExpense_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostEventExpense" ADD CONSTRAINT "PostEventExpense_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "PostEventParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostEventExpenseShare" ADD CONSTRAINT "PostEventExpenseShare_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "PostEventExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostEventExpenseShare" ADD CONSTRAINT "PostEventExpenseShare_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "PostEventParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
