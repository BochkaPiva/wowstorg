import { PrismaClient, Role, ItemType, AvailabilityStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const greenwich = await prisma.user.upsert({
    where: { telegramId: BigInt(1000001) },
    update: { username: "greenwich_demo", role: Role.GREENWICH },
    create: {
      id: "usr_greenwich_demo",
      telegramId: BigInt(1000001),
      username: "greenwich_demo",
      role: Role.GREENWICH,
    },
  });

  await prisma.user.upsert({
    where: { telegramId: BigInt(1000002) },
    update: { username: "warehouse_demo", role: Role.WAREHOUSE },
    create: {
      id: "usr_warehouse_demo",
      telegramId: BigInt(1000002),
      username: "warehouse_demo",
      role: Role.WAREHOUSE,
    },
  });

  const customerGreenwich = await prisma.customer.upsert({
    where: { name: "Greenwich Internal" },
    update: {
      contact: "internal",
      isActive: true,
    },
    create: {
      id: "cus_greenwich_internal",
      name: "Greenwich Internal",
      contact: "internal",
      isActive: true,
    },
  });

  await prisma.customer.upsert({
    where: { name: "External Client Demo" },
    update: {
      contact: "@external_client_demo",
      isActive: true,
    },
    create: {
      id: "cus_external_demo",
      name: "External Client Demo",
      contact: "@external_client_demo",
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { telegramId: BigInt(1000003) },
    update: { username: "admin_demo", role: Role.ADMIN },
    create: {
      id: "usr_admin_demo",
      telegramId: BigInt(1000003),
      username: "admin_demo",
      role: Role.ADMIN,
    },
  });

  await prisma.category.upsert({
    where: { name: "Cameras" },
    update: { description: "Camera equipment" },
    create: { id: "cat_cameras", name: "Cameras", description: "Camera equipment" },
  });
  await prisma.category.upsert({
    where: { name: "Lighting" },
    update: { description: "Lighting equipment" },
    create: { id: "cat_lighting", name: "Lighting", description: "Lighting equipment" },
  });
  await prisma.category.upsert({
    where: { name: "Consumables" },
    update: { description: "One-time use supplies" },
    create: { id: "cat_consumables", name: "Consumables", description: "One-time use supplies" },
  });

  await prisma.item.upsert({
    where: { id: "itm_camera_fx3" },
    update: {
      name: "Sony FX3",
      itemType: ItemType.ASSET,
      availabilityStatus: AvailabilityStatus.ACTIVE,
      stockTotal: 3,
      pricePerDay: 12000,
      locationText: "A-1",
    },
    create: {
      id: "itm_camera_fx3",
      name: "Sony FX3",
      description: "Cinema camera body",
      itemType: ItemType.ASSET,
      availabilityStatus: AvailabilityStatus.ACTIVE,
      stockTotal: 3,
      pricePerDay: 12000,
      locationText: "A-1",
    },
  });

  await prisma.item.upsert({
    where: { id: "itm_light_aputure300d" },
    update: {
      name: "Aputure 300D",
      itemType: ItemType.ASSET,
      availabilityStatus: AvailabilityStatus.ACTIVE,
      stockTotal: 4,
      pricePerDay: 4500,
      locationText: "B-2",
    },
    create: {
      id: "itm_light_aputure300d",
      name: "Aputure 300D",
      description: "Continuous light fixture",
      itemType: ItemType.ASSET,
      availabilityStatus: AvailabilityStatus.ACTIVE,
      stockTotal: 4,
      pricePerDay: 4500,
      locationText: "B-2",
    },
  });

  await prisma.item.upsert({
    where: { id: "itm_cable_xlr" },
    update: {
      name: "XLR Cable 5m",
      itemType: ItemType.BULK,
      availabilityStatus: AvailabilityStatus.ACTIVE,
      stockTotal: 20,
      pricePerDay: 150,
      locationText: "C-3",
    },
    create: {
      id: "itm_cable_xlr",
      name: "XLR Cable 5m",
      description: "Audio cable",
      itemType: ItemType.BULK,
      availabilityStatus: AvailabilityStatus.ACTIVE,
      stockTotal: 20,
      pricePerDay: 150,
      locationText: "C-3",
    },
  });

  await prisma.item.upsert({
    where: { id: "itm_tape_gaffer" },
    update: {
      name: "Gaffer Tape",
      itemType: ItemType.CONSUMABLE,
      availabilityStatus: AvailabilityStatus.ACTIVE,
      stockTotal: 50,
      pricePerDay: 80,
      locationText: "D-1",
    },
    create: {
      id: "itm_tape_gaffer",
      name: "Gaffer Tape",
      description: "Consumable tape roll",
      itemType: ItemType.CONSUMABLE,
      availabilityStatus: AvailabilityStatus.ACTIVE,
      stockTotal: 50,
      pricePerDay: 80,
      locationText: "D-1",
    },
  });

  const categories = await prisma.category.findMany({
    where: { id: { in: ["cat_cameras", "cat_lighting", "cat_consumables"] } },
    select: { id: true, name: true },
  });
  const categoryByName = new Map(categories.map((c) => [c.name, c.id]));

  const itemCategoryPairs = [
    ["itm_camera_fx3", categoryByName.get("Cameras")],
    ["itm_light_aputure300d", categoryByName.get("Lighting")],
    ["itm_cable_xlr", categoryByName.get("Lighting")],
    ["itm_tape_gaffer", categoryByName.get("Consumables")],
  ];

  for (const [itemId, categoryId] of itemCategoryPairs) {
    if (!categoryId) continue;
    await prisma.itemCategory.upsert({
      where: { itemId_categoryId: { itemId, categoryId } },
      update: {},
      create: { itemId, categoryId },
    });
  }

  await prisma.kit.upsert({
    where: { id: "kit_interview_basic" },
    update: {
      name: "Interview Basic Kit",
      description: "Camera + light + cables",
      isActive: true,
    },
    create: {
      id: "kit_interview_basic",
      name: "Interview Basic Kit",
      description: "Camera + light + cables",
      isActive: true,
    },
  });

  const kitLines = [
    { kitId: "kit_interview_basic", itemId: "itm_camera_fx3", defaultQty: 1 },
    { kitId: "kit_interview_basic", itemId: "itm_light_aputure300d", defaultQty: 2 },
    { kitId: "kit_interview_basic", itemId: "itm_cable_xlr", defaultQty: 4 },
  ];

  for (const line of kitLines) {
    await prisma.kitLine.upsert({
      where: {
        kitId_itemId: {
          kitId: line.kitId,
          itemId: line.itemId,
        },
      },
      update: { defaultQty: line.defaultQty },
      create: line,
    });
  }

  const existing = await prisma.order.findUnique({
    where: { id: "ord_demo_submitted" },
    select: { id: true },
  });

  if (!existing) {
    await prisma.order.create({
      data: {
        id: "ord_demo_submitted",
        createdById: greenwich.id,
        customerId: customerGreenwich.id,
        orderSource: "GREENWICH_INTERNAL",
        status: "SUBMITTED",
        startDate: new Date("2026-03-01"),
        endDate: new Date("2026-03-03"),
        eventName: "Demo Internal Event",
        pickupTime: "10:00",
        notes: "Demo order for queue testing",
        discountRate: 0.3,
        isEmergency: false,
        lines: {
          create: [
            {
              itemId: "itm_camera_fx3",
              requestedQty: 1,
              pricePerDaySnapshot: 8400,
            },
            {
              itemId: "itm_light_aputure300d",
              requestedQty: 2,
              pricePerDaySnapshot: 3150,
            },
          ],
        },
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
