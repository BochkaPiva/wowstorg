import { PrismaClient, Role, ItemType, AvailabilityStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: Role.ADMIN },
    select: { id: true },
  });
  if (!admin) {
    console.log("Skip seed: no admin user found in DB.");
    return;
  }

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

  const categoryDefs = [
    ["cat_games", "Крафт игры", "Игровые наборы и реквизит"],
    ["cat_photozone", "Фотозоны", "Декор и элементы фотозон"],
    ["cat_light", "Свет", "Световые приборы"],
    ["cat_sound", "Звук", "Аудио оборудование"],
    ["cat_stage", "Сцена", "Сценические элементы"],
    ["cat_consumables", "Расходники", "Ленты, батарейки, крепеж"],
  ];
  for (const [id, name, description] of categoryDefs) {
    await prisma.category.upsert({
      where: { name },
      update: { description },
      create: { id, name, description },
    });
  }

  const items = [
    ["itm_cam_fx3", "Камера Sony FX3", ItemType.ASSET, 4, 12000, "A-01", "cat_photozone"],
    ["itm_cam_a7s3", "Камера Sony A7S III", ItemType.ASSET, 3, 9000, "A-02", "cat_photozone"],
    ["itm_light_300d", "Свет Aputure 300D", ItemType.ASSET, 6, 4500, "B-01", "cat_light"],
    ["itm_light_tube", "Световая трубка Nanlite", ItemType.ASSET, 10, 1800, "B-02", "cat_light"],
    ["itm_mic_kit", "Набор беспроводных микрофонов", ItemType.ASSET, 5, 2500, "C-01", "cat_sound"],
    ["itm_speaker", "Активная колонка 12\"", ItemType.ASSET, 8, 3000, "C-02", "cat_sound"],
    ["itm_xlr_5m", "Кабель XLR 5 м", ItemType.BULK, 80, 120, "C-03", "cat_sound"],
    ["itm_stand_light", "Стойка для света", ItemType.BULK, 40, 200, "B-03", "cat_light"],
    ["itm_game_jenga", "Дженга XXL", ItemType.ASSET, 6, 1300, "D-01", "cat_games"],
    ["itm_game_ring", "Игра Кольцеброс", ItemType.ASSET, 10, 700, "D-02", "cat_games"],
    ["itm_game_darts", "Дартс безопасный", ItemType.ASSET, 8, 650, "D-03", "cat_games"],
    ["itm_game_boxing", "Силомер боксерский", ItemType.ASSET, 2, 6000, "D-04", "cat_games"],
    ["itm_photo_arch", "Арка для фотозоны", ItemType.ASSET, 7, 1900, "E-01", "cat_photozone"],
    ["itm_photo_neon", "Неоновая вывеска", ItemType.ASSET, 9, 1500, "E-02", "cat_photozone"],
    ["itm_photo_flower", "Цветочная стойка", ItemType.BULK, 15, 350, "E-03", "cat_photozone"],
    ["itm_stage_cube", "Сценический куб 50x50", ItemType.BULK, 25, 450, "F-01", "cat_stage"],
    ["itm_stage_podium", "Подиум секционный", ItemType.BULK, 20, 500, "F-02", "cat_stage"],
    ["itm_led_screen", "LED-экран модульный", ItemType.ASSET, 4, 10000, "F-03", "cat_stage"],
    ["itm_tape_gaffer", "Гафферная лента", ItemType.CONSUMABLE, 200, 80, "G-01", "cat_consumables"],
    ["itm_zip_ties", "Хомуты пластиковые", ItemType.CONSUMABLE, 500, 15, "G-02", "cat_consumables"],
    ["itm_battery_aa", "Батарейки AA", ItemType.CONSUMABLE, 800, 35, "G-03", "cat_consumables"],
    ["itm_extension", "Удлинитель 10 м", ItemType.BULK, 70, 100, "G-04", "cat_consumables"],
    ["itm_fog_machine", "Дым-машина", ItemType.ASSET, 3, 3500, "H-01", "cat_stage"],
    ["itm_fan", "Вентилятор сценический", ItemType.ASSET, 6, 800, "H-02", "cat_stage"],
    ["itm_table_craft", "Стол складной", ItemType.BULK, 16, 220, "H-03", "cat_games"],
    ["itm_chairs", "Стул складной", ItemType.BULK, 120, 40, "H-04", "cat_games"],
    ["itm_projector", "Проектор Full HD", ItemType.ASSET, 5, 4200, "I-01", "cat_stage"],
    ["itm_screen", "Экран проекционный", ItemType.ASSET, 7, 1600, "I-02", "cat_stage"],
    ["itm_decor_set", "Комплект декора", ItemType.ASSET, 11, 1200, "I-03", "cat_photozone"],
    ["itm_game_quest", "Квест-комплект", ItemType.ASSET, 6, 2800, "I-04", "cat_games"],
  ];

  for (const [id, name, itemType, stockTotal, pricePerDay, locationText] of items) {
    await prisma.item.upsert({
      where: { id },
      update: { name, itemType, availabilityStatus: AvailabilityStatus.ACTIVE, stockTotal, pricePerDay, locationText },
      create: {
        id,
        name,
        description: `${name} — тестовая позиция`,
        itemType,
        availabilityStatus: AvailabilityStatus.ACTIVE,
        stockTotal,
        pricePerDay,
        locationText,
      },
    });
  }

  const categories = await prisma.category.findMany({
    where: { id: { in: categoryDefs.map((entry) => entry[0]) } },
    select: { id: true, name: true },
  });
  const categoryById = new Map(categories.map((entry) => [entry.id, entry.id]));
  const itemCategoryPairs = items.map((entry) => [entry[0], categoryById.get(entry[6])]);

  for (const [itemId, categoryId] of itemCategoryPairs) {
    if (!categoryId) continue;
    await prisma.itemCategory.upsert({
      where: { itemId_categoryId: { itemId, categoryId } },
      update: {},
      create: { itemId, categoryId },
    });
  }

  const kits = [
    ["kit_craft_party", "Крафт вечеринка", "Игровой комплект для крафт-зоны", "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?w=640"],
    ["kit_photo_basic", "Фотозона базовая", "Арка, декор и свет", "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=640"],
    ["kit_stage_show", "Сцена шоу", "Свет, звук и экран", "https://images.unsplash.com/photo-1506157786151-b8491531f063?w=640"],
    ["kit_quick_interview", "Интервью быстрый", "Камера, свет и микрофоны", "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=640"],
  ];
  for (const [id, name, description, coverImageUrl] of kits) {
    await prisma.kit.upsert({
      where: { id },
      update: { name, description, coverImageUrl, isActive: true },
      create: { id, name, description, coverImageUrl, isActive: true },
    });
  }

  const kitLines = [
    { kitId: "kit_craft_party", itemId: "itm_game_jenga", defaultQty: 2 },
    { kitId: "kit_craft_party", itemId: "itm_game_ring", defaultQty: 2 },
    { kitId: "kit_craft_party", itemId: "itm_table_craft", defaultQty: 2 },
    { kitId: "kit_photo_basic", itemId: "itm_photo_arch", defaultQty: 1 },
    { kitId: "kit_photo_basic", itemId: "itm_photo_neon", defaultQty: 1 },
    { kitId: "kit_photo_basic", itemId: "itm_light_tube", defaultQty: 2 },
    { kitId: "kit_stage_show", itemId: "itm_led_screen", defaultQty: 1 },
    { kitId: "kit_stage_show", itemId: "itm_speaker", defaultQty: 2 },
    { kitId: "kit_stage_show", itemId: "itm_fog_machine", defaultQty: 1 },
    { kitId: "kit_quick_interview", itemId: "itm_cam_fx3", defaultQty: 1 },
    { kitId: "kit_quick_interview", itemId: "itm_light_300d", defaultQty: 2 },
    { kitId: "kit_quick_interview", itemId: "itm_mic_kit", defaultQty: 1 },
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
              itemId: "itm_cam_fx3",
              requestedQty: 1,
              pricePerDaySnapshot: 8400,
            },
            {
              itemId: "itm_light_300d",
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
