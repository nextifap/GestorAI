// seed_unifap.js
// Script idempotente para garantir que os metadados da UniFAP estejam no banco.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const name = 'Centro Universitário Paraíso (UniFAP)';

  let inst = await prisma.institution.findFirst({ where: { name } });
  if (!inst) {
    inst = await prisma.institution.create({
      data: {
        name,
        shortName: 'UniFAP',
        city: 'Juazeiro do Norte',
        state: 'Ceará',
        country: 'Brasil',
        foundedYear: 2006,
        status: 'Centro Universitário - nota máxima no MEC',
        description: 'Polo tecnológico do Cariri cearense. 20 anos em 2026.',
      },
    });
    console.log('Institution created:', inst.id);
  } else {
    console.log('Institution exists:', inst.id);
  }

  // cursos básicos
  const cursos = [
    { name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS', degree: 'Tecnólogo', duration_semesters: 5, workload_hours: 2180 },
    { name: 'Sistemas de Informação', code: 'SI', degree: 'Bacharelado', duration_semesters: 8, workload_hours: 3040 }
  ];

  for (const course of cursos) {
    const exists = await prisma.course.findFirst({
      where: { name: course.name, institutionId: inst.id },
    });
    if (!exists) {
      const created = await prisma.course.create({
        data: { ...course, institutionId: inst.id },
      });
      console.log('Course created:', created.name);
    } else {
      console.log('Course exists:', exists.name);
    }
  }

  await prisma.$disconnect();
}

main().catch((e)=>{ console.error(e); process.exit(1); });
