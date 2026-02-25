-- CreateTable
CREATE TABLE "internal_consumables" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internal_consumables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "internal_consumables_name_idx" ON "internal_consumables"("name");
