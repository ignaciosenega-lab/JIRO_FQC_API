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

  // Create franchises (all 44)
  const franchises = [
    { id: 'F-001', name: 'Jiro Sushi Palermo', zona: 'CABA', barrio: 'Palermo', address: 'Gorriti 3999', city: 'Buenos Aires', phone: '11-3848-4957', whatsapp1: '11-3848-4957', whatsapp2: '', googleMaps: 'https://maps.google.com/?q=Gorriti+3999+Palermo', email: 'palermo@jirosushi.com', responsable: 'Martín Gómez', status: 'activa', openDate: '2022-03-15', employees: 14, lastAuditScore: 91, monthlyBilling: 5800000, notes: 'Sucursal flagship. Excelente rendimiento sostenido.', score: 91 },
    { id: 'F-002', name: 'Jiro Sushi Villa Urquiza', zona: 'CABA', barrio: 'Villa Urquiza', address: 'Av. Triunvirato 5607', city: 'Buenos Aires', phone: '15-2502-8472', whatsapp1: '11-2502-8472', whatsapp2: '', googleMaps: '', email: 'villaurquiza@jirosushi.com', responsable: 'Lucía Romero', status: 'activa', openDate: '2022-07-20', employees: 11, lastAuditScore: 85, monthlyBilling: 4200000, notes: '', score: 85 },
    { id: 'F-003', name: 'Jiro Sushi Villa Ortúzar', zona: 'CABA', barrio: 'Villa Ortúzar', address: 'La Pampa 4482', city: 'Buenos Aires', phone: '11-2346-5282', whatsapp1: '11-2346-5282', whatsapp2: '', googleMaps: '', email: 'villaortuzar@jirosushi.com', responsable: 'Carlos Díaz', status: 'activa', openDate: '2023-01-10', employees: 9, lastAuditScore: 79, monthlyBilling: 3100000, notes: '', score: 79 },
    { id: 'F-004', name: 'Jiro Sushi Barracas', zona: 'CABA', barrio: 'Barracas', address: 'Av. Patricios 1492', city: 'Buenos Aires', phone: '11-3336-1900', whatsapp1: '11-3336-1900', whatsapp2: '', googleMaps: '', email: 'barracas@jirosushi.com', responsable: 'Sofía Martínez', status: 'activa', openDate: '2023-04-05', employees: 10, lastAuditScore: 82, monthlyBilling: 3400000, notes: '', score: 82 },
    { id: 'F-005', name: 'Jiro Sushi Belgrano', zona: 'CABA', barrio: 'Belgrano', address: 'Moldes 2349', city: 'Buenos Aires', phone: '4896-2617', whatsapp1: '11-7164-2145', whatsapp2: '', googleMaps: '', email: 'belgrano@jirosushi.com', responsable: 'Andrés Paz', status: 'activa', openDate: '2022-11-18', employees: 12, lastAuditScore: 88, monthlyBilling: 4800000, notes: '', score: 88 },
    { id: 'F-006', name: 'Jiro Sushi Caballito', zona: 'CABA', barrio: 'Caballito', address: 'Av. La Plata 746', city: 'Buenos Aires', phone: '2088-3017', whatsapp1: '11-5691-1851', whatsapp2: '', googleMaps: '', email: 'caballito@jirosushi.com', responsable: 'María Elena Ruiz', status: 'activa', openDate: '2023-06-12', employees: 10, lastAuditScore: 76, monthlyBilling: 3600000, notes: '', score: 76 },
    { id: 'F-007', name: 'Jiro Sushi Las Cañitas', zona: 'CABA', barrio: 'Las Cañitas', address: 'Huergo 252', city: 'Buenos Aires', phone: '4801-4989', whatsapp1: '11-2255-5625', whatsapp2: '', googleMaps: '', email: 'lascanitas@jirosushi.com', responsable: 'Fernando López', status: 'activa', openDate: '2023-02-28', employees: 11, lastAuditScore: 90, monthlyBilling: 5200000, notes: '', score: 90 },
    { id: 'F-008', name: 'Jiro Sushi Devoto', zona: 'CABA', barrio: 'Villa Devoto', address: 'Bermúdez 3197', city: 'Buenos Aires', phone: '11-7538-0793', whatsapp1: '11-7020-3067', whatsapp2: '', googleMaps: '', email: 'devoto@jirosushi.com', responsable: 'Pablo Herrera', status: 'activa', openDate: '2023-09-14', employees: 8, lastAuditScore: 73, monthlyBilling: 2900000, notes: '', score: 73 },
    { id: 'F-009', name: 'Jiro Sushi Recoleta', zona: 'CABA', barrio: 'Recoleta', address: 'French 2926', city: 'Buenos Aires', phone: '4853-0058', whatsapp1: '11-6719-3129', whatsapp2: '', googleMaps: '', email: 'recoleta@jirosushi.com', responsable: 'Valentina Torres', status: 'activa', openDate: '2022-08-30', employees: 13, lastAuditScore: 93, monthlyBilling: 5500000, notes: 'Una de las sucursales con mejor score sostenido.', score: 93 },
    { id: 'F-010', name: 'Jiro Sushi San Cristóbal', zona: 'CABA', barrio: 'San Cristóbal', address: 'Moreno 2299', city: 'Buenos Aires', phone: '11-4703-1843', whatsapp1: '11-5179-6330', whatsapp2: '', googleMaps: '', email: 'sancristobal@jirosushi.com', responsable: 'Diego Morales', status: 'en_revision', openDate: '2024-01-22', employees: 8, lastAuditScore: 64, monthlyBilling: 2400000, notes: 'Score bajo en auditorías.', score: 64 },
    { id: 'F-019', name: 'Jiro Sushi San Isidro', zona: 'GBA Norte', barrio: 'San Isidro', address: 'Alsina 501', city: 'Buenos Aires', phone: '11-5611-0501', whatsapp1: '11-2456-5912', whatsapp2: '', googleMaps: '', email: 'sanisidro@jirosushi.com', responsable: 'Julieta Acosta', status: 'activa', openDate: '2023-10-05', employees: 10, lastAuditScore: 87, monthlyBilling: 4100000, notes: '', score: 87 },
    { id: 'F-020', name: 'Jiro Sushi Olivos', zona: 'GBA Norte', barrio: 'Olivos', address: 'Juan Carlos Cruz 2386', city: 'Buenos Aires', phone: '7709-5388', whatsapp1: '11-3026-3380', whatsapp2: '', googleMaps: '', email: 'olivos@jirosushi.com', responsable: 'Alejandro Vega', status: 'activa', openDate: '2023-12-01', employees: 10, lastAuditScore: 84, monthlyBilling: 3900000, notes: '', score: 84 },
    { id: 'F-028', name: 'Jiro Sushi Avellaneda', zona: 'GBA Sur', barrio: 'Avellaneda', address: 'Gral. Lavalle 192', city: 'Buenos Aires', phone: '2146-3933', whatsapp1: '11-5127-3131', whatsapp2: '', googleMaps: '', email: 'avellaneda@jirosushi.com', responsable: 'Agustín Varela', status: 'activa', openDate: '2024-03-01', employees: 9, lastAuditScore: 80, monthlyBilling: 3000000, notes: '', score: 80 },
    { id: 'F-036', name: 'Jiro Sushi La Plata', zona: 'La Plata', barrio: 'Centro', address: 'Calle 55 840', city: 'La Plata', phone: '221-399-4878', whatsapp1: '221-399-4878', whatsapp2: '', googleMaps: '', email: 'laplata@jirosushi.com', responsable: 'Martín Olivera', status: 'activa', openDate: '2024-07-15', employees: 9, lastAuditScore: 81, monthlyBilling: 3100000, notes: '', score: 81 },
    { id: 'F-039', name: 'Jiro Sushi Nueva Córdoba', zona: 'Interior', barrio: 'Nueva Córdoba', address: 'Rondeau 614', city: 'Córdoba', phone: '3517-04-4466', whatsapp1: '351-704-4466', whatsapp2: '', googleMaps: '', email: 'nuevacordoba@jirosushi.com', responsable: 'Diego Ruiz', status: 'activa', openDate: '2025-01-12', employees: 10, lastAuditScore: 83, monthlyBilling: 3200000, notes: '', score: 83 },
    { id: 'F-043', name: 'Jiro Sushi Rosario', zona: 'Interior', barrio: 'Centro', address: 'España 578', city: 'Rosario', phone: '3417-46-2859', whatsapp1: '3417-55-1295', whatsapp2: '', googleMaps: '', email: 'rosario@jirosushi.com', responsable: 'Ezequiel Blanco', status: 'activa', openDate: '2025-08-15', employees: 9, lastAuditScore: 82, monthlyBilling: 3100000, notes: '', score: 82 },
  ];

  for (const f of franchises) {
    await prisma.franchise.upsert({
      where: { id: f.id },
      update: {},
      create: f,
    });
  }
  console.log('✅ Franchises created (16 locations)');

  // Create superadmin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@jiro.com' },
    update: { role: 'SUPERADMIN' },
    create: {
      email: 'admin@jiro.com',
      password: adminPassword,
      name: 'JIRO Admin',
      role: 'SUPERADMIN',
    },
  });
  console.log('✅ Superadmin user created (admin@jiro.com / admin123)');

  // Create franquicia user
  const franchisePassword = await bcrypt.hash('franchise123', 10);
  await prisma.user.upsert({
    where: { email: 'palermo@jiro.com' },
    update: { role: 'FRANQUICIA' },
    create: {
      email: 'palermo@jiro.com',
      password: franchisePassword,
      name: 'Gerente Palermo',
      role: 'FRANQUICIA',
      franchiseId: 'F-001',
    },
  });
  console.log('✅ Franquicia user created (palermo@jiro.com / franchise123)');

  // Create manager demo user
  const managerPassword = await bcrypt.hash('manager123', 10);
  await prisma.user.upsert({
    where: { email: 'manager@jiro.com' },
    update: { role: 'MANAGER' },
    create: {
      email: 'manager@jiro.com',
      password: managerPassword,
      name: 'Manager Demo',
      role: 'MANAGER',
    },
  });
  console.log('✅ Manager user created (manager@jiro.com / manager123)');

  // Create operaciones demo user
  const opsPassword = await bcrypt.hash('ops123', 10);
  await prisma.user.upsert({
    where: { email: 'ops@jiro.com' },
    update: { role: 'OPERACIONES' },
    create: {
      email: 'ops@jiro.com',
      password: opsPassword,
      name: 'Operaciones Demo',
      role: 'OPERACIONES',
    },
  });
  console.log('✅ Operaciones user created (ops@jiro.com / ops123)');

  // Create Ono config
  await prisma.onoConfig.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', customPrompt: '' },
  });
  console.log('✅ Ono config created');

  // Create Audit config with default rules (matching the previously hardcoded ones)
  const defaultCocinaCategories = [
    { id: 'c01', number: '01', title: 'Presentación', items: [{ name: 'Packaging' }, { name: 'Disposición de piezas' }, { name: 'Decoración' }] },
    { id: 'c02', number: '02', title: 'Producción', items: [{ name: 'Mise and Place (16-18:45h)' }, { name: 'Previsión de pedidos' }, { name: 'Rótulos' }] },
    { id: 'c03', number: '03', title: 'Mantenimiento', items: [{ name: 'Luces' }, { name: 'Imagen' }, { name: 'Pintura' }, { name: 'Decoración general' }, { name: 'Marca' }] },
    { id: 'c04', number: '04', title: 'Recetario', items: [{ name: 'Peso' }, { name: 'Faltante' }, { name: 'Visibilidad' }, { name: 'Cumplimiento' }] },
    { id: 'c05', number: '05', title: 'Disponibilidad de Elementos', items: [{ name: 'Heladeras' }, { name: 'Freidoras y Anafes' }, { name: 'Cuchillos' }, { name: 'Tablas' }, { name: 'Generales' }] },
    { id: 'c06', number: '06', title: 'Manipulación', items: [{ name: 'Desechos' }, { name: 'Cadena de frío' }, { name: 'Contaminacion cruzada' }] },
    { id: 'c07', number: '07', title: 'Comunicación', items: [{ name: 'Difusión de promociones' }, { name: 'Producción ofertada' }, { name: 'Tiempo de comanda' }] },
    { id: 'c08', number: '08', title: 'Limpieza General de Cocina', items: [{ name: 'Pisos' }, { name: 'Higiene del personal' }, { name: 'General' }] },
    { id: 'c09', number: '09', title: 'Limpieza', items: [{ name: 'Heladeras limpieza' }, { name: 'Freidoras y Anafes limpieza' }, { name: 'Tablas limpieza' }, { name: 'Generales limpieza' }] },
    { id: 'c10', number: '10', title: 'Demora en Cocina', items: [{ name: 'Personal' }, { name: 'Mise and Place correcto' }, { name: 'Rendimiento equipo' }, { name: 'Conocimiento de la carta' }] },
    { id: 'c11', number: '11', title: 'Demora del Servicio', items: [{ name: 'Apps' }, { name: 'Retira' }, { name: 'Tiempo de comanda servicio' }] },
    { id: 'c12', number: '12', title: 'Compras', items: [{ name: 'Proveedor autorizado' }] },
  ];

  const defaultCajasCategories = [
    { id: 'j01', number: '01', title: 'Seguridad', items: [{ name: 'Matafuegos' }, { name: 'Fumigación' }, { name: 'Manipulación de alimentos' }] },
    { id: 'j02', number: '02', title: 'Atención', items: [{ name: 'Resolución de casos' }, { name: 'Ofrecimiento de productos' }, { name: 'Nivel de servicio' }, { name: 'Agilidad' }] },
    { id: 'j03', number: '03', title: 'Demora en Caja', items: [{ name: 'Toma de pedidos' }, { name: 'Falta de motos' }, { name: 'Demora de empaquetado' }, { name: 'Respuesta de WhatsApp' }] },
    { id: 'j04', number: '04', title: 'Difusión', items: [{ name: 'Grupos' }, { name: 'Frecuencia' }] },
    { id: 'j05', number: '05', title: 'Limpieza', items: [{ name: 'Pisos caja' }, { name: 'Orden' }, { name: 'General caja' }] },
    { id: 'j06', number: '06', title: 'Uniformes', items: [{ name: 'Uniforme caja' }, { name: 'Uniforme cocina' }] },
    { id: 'j07', number: '07', title: 'Packaging', items: [{ name: 'Faltantes' }, { name: 'Buena utilización' }] },
    { id: 'j08', number: '08', title: 'Cierre de Apps', items: [{ name: 'Rappi' }, { name: 'Pedidos Ya' }, { name: 'Mas Delivery' }, { name: 'Pedidos anulados' }, { name: 'Pedidos rechazados' }] },
  ];

  await prisma.auditConfig.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      cocinaCategories: JSON.stringify(defaultCocinaCategories),
      cajasCategories: JSON.stringify(defaultCajasCategories),
    },
  });
  console.log('✅ Audit config created');

  console.log('\n🎉 Seed complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
