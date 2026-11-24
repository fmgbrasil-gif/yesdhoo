import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
(async () => {
  const s = await db.screen.findFirst({ orderBy: { createdAt: 'asc' } });
  await db.screen.update({ where: { id: s!.id }, data: { orientation: 'V', rotation: 'auto', deviceToken: 'tok-teste-vertical' } });
  console.log(s!.name, s!.orientation, s!.deviceToken);
  await db.$disconnect();
})();
