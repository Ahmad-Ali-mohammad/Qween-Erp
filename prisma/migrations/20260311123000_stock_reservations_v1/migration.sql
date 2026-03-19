CREATE TABLE "StockReservation" (
    "id" SERIAL NOT NULL,
    "reference" TEXT,
    "sourceType" TEXT,
    "sourceId" INTEGER,
    "itemId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "locationId" INTEGER,
    "branchId" INTEGER,
    "projectId" INTEGER,
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MaintenanceSparePart" ADD COLUMN "stockReservationId" INTEGER;

CREATE INDEX "StockReservation_itemId_warehouseId_idx" ON "StockReservation"("itemId", "warehouseId");
CREATE INDEX "StockReservation_status_reservedAt_idx" ON "StockReservation"("status", "reservedAt");
CREATE INDEX "StockReservation_sourceType_sourceId_idx" ON "StockReservation"("sourceType", "sourceId");

CREATE INDEX "MaintenanceSparePart_stockReservationId_idx" ON "MaintenanceSparePart"("stockReservationId");

ALTER TABLE "StockReservation"
    ADD CONSTRAINT "StockReservation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockReservation"
    ADD CONSTRAINT "StockReservation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockReservation"
    ADD CONSTRAINT "StockReservation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockReservation"
    ADD CONSTRAINT "StockReservation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockReservation"
    ADD CONSTRAINT "StockReservation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MaintenanceSparePart"
    ADD CONSTRAINT "MaintenanceSparePart_stockReservationId_fkey" FOREIGN KEY ("stockReservationId") REFERENCES "StockReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
