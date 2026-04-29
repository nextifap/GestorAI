import prisma from '@/lib/prisma';

export async function resolveManagerUserId(fallbackUserId) {
  const managerUser = await prisma.user.findFirst({
    where: {
      telegramId: null,
    },
    select: { id: true },
  });

  return managerUser?.id || fallbackUserId;
}
