import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create default categories
  const categories = [
    { title: 'Guía de Marca', description: 'Logos, tipografía y reglas de identidad visual de marca.', icon: 'ShieldCheck', color: 'text-emerald-400', bg: 'bg-emerald-400/10', isDefault: true },
    { title: 'Seguridad Alimentaria', description: 'Estándares HACCP, almacenamiento y protocolos de higiene.', icon: 'UtensilsCrossed', color: 'text-orange-400', bg: 'bg-orange-400/10', isDefault: true },
    { title: 'Atención al Cliente', description: 'Estándares de saludo, resolución de conflictos y ventas adicionales.', icon: 'Users', color: 'text-blue-400', bg: 'bg-blue-400/10', isDefault: true },
    { title: 'POEs Financieros', description: 'Reportes, contabilidad y regalías de franquicia.', icon: 'Landmark', color: 'text-purple-400', bg: 'bg-purple-400/10', isDefault: true },
    { title: 'Marketing', description: 'Estrategias de difusión, redes sociales y material promocional.', icon: 'Megaphone', color: 'text-red-400', bg: 'bg-red-400/10', isDefault: true },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { title: cat.title },
      update: {},
      create: cat,
    });
  }
  console.log('✅ Categories created');

  // Create franchises
  const franchises = [
    { name: 'Jiro Palermo', location: 'Buenos Aires', score: 92, status: 'Operativa' },
    { name: 'Jiro Recoleta', location: 'Buenos Aires', score: 88, status: 'Operativa' },
    { name: 'Jiro Nordelta', location: 'Tigre', score: 76, status: 'En revisión' },
    { name: 'Jiro Rosario', location: 'Rosario', score: 85, status: 'Operativa' },
  ];

  const createdFranchises = [];
  for (const f of franchises) {
    const franchise = await prisma.franchise.upsert({
      where: { id: f.name.toLowerCase().replace(/\s/g, '-') },
      update: {},
      create: { id: f.name.toLowerCase().replace(/\s/g, '-'), ...f },
    });
    createdFranchises.push(franchise);
  }
  console.log('✅ Franchises created');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@jiro.com' },
    update: {},
    create: {
      email: 'admin@jiro.com',
      password: adminPassword,
      name: 'JIRO Admin',
      role: 'ADMIN',
    },
  });
  console.log('✅ Admin user created (admin@jiro.com / admin123)');

  // Create franchise user
  const franchisePassword = await bcrypt.hash('franchise123', 10);
  await prisma.user.upsert({
    where: { email: 'palermo@jiro.com' },
    update: {},
    create: {
      email: 'palermo@jiro.com',
      password: franchisePassword,
      name: 'Gerente Palermo',
      role: 'FRANCHISE',
      franchiseId: createdFranchises[0].id,
    },
  });
  console.log('✅ Franchise user created (palermo@jiro.com / franchise123)');

  // Create Ono config
  await prisma.onoConfig.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', customPrompt: '' },
  });
  console.log('✅ Ono config created');

  console.log('\n🎉 Seed complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
