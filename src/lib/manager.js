import prisma from './prisma.js';

export async function resolveManagerUserId(fallbackUserId) {
  const managerUser = await prisma.user.findFirst({
    where: {
      role: 'admin',
      telegramId: null,
    },
    select: { id: true },
  });

  return managerUser?.id || fallbackUserId;
}
