-- „Какво ново“ (src/news/): кога е излязла всяка новина и последното „Разбрах“ на всеки профил — адитивно.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "newsReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "NewsEntry" (
    "id" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsEntry_pkey" PRIMARY KEY ("id")
);


-- Съществуващите профили виждат новините, излезли след регистрацията им (иначе първото обновяване
-- с прозореца не би показало нищо на никого). Новите профили — от момента на създаване (по подразбиране).
UPDATE "User" SET "newsReadAt" = "createdAt" WHERE "createdAt" < "newsReadAt";
