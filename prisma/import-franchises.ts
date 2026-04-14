/**
 * One-shot import script. Run manually once after deploying:
 *   npx tsx prisma/import-franchises.ts
 *
 * What it does:
 * - Upserts each franchise by name (or by alias for renames).
 * - On UPDATE, only overwrites the columns that come from the spreadsheet
 *   (name, responsable, phone, barrio, zona, city, address, notes) — it keeps
 *   any operational data already in the DB (employees, score, lastAuditScore,
 *   monthlyBilling, email, whatsapp, googleMaps, openDate).
 * - On CREATE, sets sensible defaults.
 * - Aliases cover the 2 renames confirmed by the user:
 *     Balvanera  ← previously "Jiro Sushi San Cristóbal"
 *     Córdoba    ← previously "Jiro Sushi Nueva Córdoba"
 *   Plus 3 short-name renames the user chose:
 *     Cañitas    ← previously "Jiro Sushi Las Cañitas"
 *     Ortúzar    ← previously "Jiro Sushi Villa Ortúzar"
 *     Urquiza    ← previously "Jiro Sushi Villa Urquiza"
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface InputFranchise {
  localName: string;      // short name that goes into "Jiro Sushi <X>"
  razonSocial: string;
  responsable: string;
  phone: string;
  zona: string;
  city: string;
  address: string;
  aliasMatchName?: string; // existing DB name to look up, when renaming
}

const data: InputFranchise[] = [
  { localName: 'Adrogue',          razonSocial: 'CARRIZO SANDRA HAYDEE',                                      responsable: 'Martín Caldelas',                          phone: '1123485558', zona: 'GBA Sur',    city: 'Adrogué',          address: 'Spiro 1051' },
  { localName: 'Avellaneda',       razonSocial: 'NICOLA CANDIA MARCELO RICARDO',                              responsable: 'Marcelo Ricardo Nicola Candia',            phone: '1151273131', zona: 'GBA Sur',    city: 'Avellaneda',       address: 'Gral. Lavalle 192' },
  { localName: 'Banfield',         razonSocial: 'NIELSEN CRISTIAN HERNAN',                                    responsable: 'NIELSEN CRISTIAN HERNAN',                  phone: '1161532033', zona: 'GBA Sur',    city: 'Banfield',         address: 'Belgrano 1385' },
  { localName: 'Barracas',         razonSocial: 'NEIRA FEDERICO OSCAR',                                       responsable: 'NEIRA FEDERICO OSCAR',                     phone: '1133361900', zona: 'CABA',       city: 'Buenos Aires',     address: 'Av. Patricios 1492' },
  { localName: 'Belgrano',         razonSocial: 'LACERIS SRL',                                                responsable: 'Jauregui Rojas Michael',                   phone: '1171642145', zona: 'CABA',       city: 'Buenos Aires',     address: 'Moldes 2349' },
  { localName: 'Caballito',        razonSocial: 'LUCAS BISCIONE',                                             responsable: 'LUCAS BISCIONE',                           phone: '1156911851', zona: 'CABA',       city: 'Buenos Aires',     address: 'Av. La Plata 746' },
  { localName: 'Canning',          razonSocial: 'BROUWER DE KONING SUESCUN JULIO RODOLFO',                    responsable: 'BROUWER DE KONING SUESCUN JULIO RODOLFO',  phone: '1126415180', zona: 'GBA Sur',    city: 'Canning',          address: 'Pedro Arocena 4785' },
  { localName: 'Caseros',          razonSocial: 'Risuleo Lautaro Gaston',                                     responsable: 'Risuleo Lautaro Gaston',                   phone: '1130047960', zona: 'GBA Oeste',  city: 'Caseros',          address: 'Andrés Ferreyra 2789' },
  { localName: 'Colegiales',       razonSocial: 'LACERIS SRL',                                                responsable: 'Jauregui Rojas Michael',                   phone: '1166852626', zona: 'CABA',       city: 'Buenos Aires',     address: 'Palpa 2499' },
  { localName: 'Comodoro',         razonSocial: 'ORTIZ FRANCO MARTIN',                                        responsable: 'ORTIZ FRANCO MARTIN',                      phone: '2974730156', zona: 'Interior',   city: 'Comodoro Rivadavia', address: 'Ameghino 1696' },
  { localName: 'Córdoba',          razonSocial: 'SIVIANOFF SOCIEDAD POR ACCIONES SIMPLIFICADA',               responsable: 'Juan ignatoff',                            phone: '3517044466', zona: 'Interior',   city: 'Córdoba',          address: 'Rondeau 614',                aliasMatchName: 'Jiro Sushi Nueva Córdoba' },
  { localName: 'Corrientes',       razonSocial: 'DEPSE INVERSIONES SAS',                                      responsable: 'Tomás Depiaggio',                          phone: '3794051546', zona: 'Interior',   city: 'Corrientes',       address: 'Mendoza 1153' },
  { localName: 'Devoto',           razonSocial: 'SEQUEIRA DAVID IGNACIO',                                     responsable: 'David Sequeira',                           phone: '1170203067', zona: 'CABA',       city: 'Buenos Aires',     address: 'Bermúdez 3197' },
  { localName: 'Flores',           razonSocial: 'TORRES DANIEL ALEJANDRO',                                    responsable: 'Daniel Torres',                            phone: '1164725844', zona: 'CABA',       city: 'Buenos Aires',     address: 'Av. Juan B Alberdi 2602' },
  { localName: 'Floresta',         razonSocial: 'JAUREGUI ROJAS MICHAEL HUMBERTO',                            responsable: 'Jauregui Rojas Michael',                   phone: '1176076615', zona: 'CABA',       city: 'Buenos Aires',     address: 'Sanabria 2216' },
  { localName: 'Ortúzar',          razonSocial: 'JAUREGUI ROJAS MICHAEL HUMBERTO',                            responsable: 'Jauregui Rojas Michael',                   phone: '1123465282', zona: 'CABA',       city: 'Buenos Aires',     address: 'La Pampa 4482',              aliasMatchName: 'Jiro Sushi Villa Ortúzar' },
  { localName: 'La Plata',         razonSocial: 'VAZQUEZ MARCOS RODOLFO',                                     responsable: 'VAZQUEZ MARCOS RODOLFO',                   phone: '2213994878', zona: 'La Plata',   city: 'La Plata',         address: 'Calle 55 N° 840' },
  { localName: 'Lanús',            razonSocial: 'RODEIRO DIEGO NICOLAS',                                      responsable: 'Lucas Biscione',                           phone: '1126726384', zona: 'GBA Sur',    city: 'Lanús',            address: 'Presidente Sarmiento 1802' },
  { localName: 'Cañitas',          razonSocial: 'BOLIVAR MARTINEZ JERWINSON YOSUE',                           responsable: 'BOLIVAR MARTINEZ JERWINSON YOSUE',         phone: '1122555625', zona: 'CABA',       city: 'Buenos Aires',     address: 'Huergo 252',                 aliasMatchName: 'Jiro Sushi Las Cañitas' },
  { localName: 'Las Lomitas',      razonSocial: 'BROTHERS BAKERY',                                            responsable: 'Jauregui Rojas Michael',                   phone: '1123437915', zona: 'GBA Sur',    city: 'Lomas de Zamora',  address: 'Av. H. Yrigoyen 9368' },
  { localName: 'Liniers',          razonSocial: 'YARANGA HERRERA BRYAN REYNALDO',                             responsable: 'Bryan Yaranga',                            phone: '1165884326', zona: 'CABA',       city: 'Buenos Aires',     address: 'Av. Rivadavia 9833' },
  { localName: 'Mendoza',          razonSocial: 'GHAZOUL FIGUEROA KAREN YAMILA',                              responsable: 'GHAZOUL FIGUEROA KAREN YAMILA',            phone: '2617174758', zona: 'Interior',   city: 'Mendoza',          address: 'Av. Colón 212' },
  { localName: 'Monte Grande',     razonSocial: 'Lapadjian Lionel Hugo',                                      responsable: 'Lapadjian Lionel Hugo',                    phone: '1159439109', zona: 'GBA Sur',    city: 'Monte Grande',     address: 'Dardo Rocha 388' },
  { localName: 'Neuquén',          razonSocial: 'JAVIER OSVALDO CUBILLOS',                                    responsable: 'JAVIER OSVALDO CUBILLOS',                  phone: '2995017623', zona: 'Interior',   city: 'Neuquén',          address: 'Don Bosco 290' },
  { localName: 'Núñez',            razonSocial: 'TIFFIN SRL',                                                 responsable: 'Luis Ermoli',                              phone: '1124879447', zona: 'CABA',       city: 'Buenos Aires',     address: 'Crisólogo Larralde 2876' },
  { localName: 'Olivos',           razonSocial: 'ERMOLI NIEVES EMILIANO',                                     responsable: 'Emiliano Ermoli',                          phone: '1130263380', zona: 'GBA Norte',  city: 'Vicente López',    address: 'Juan Carlos Cruz 2386' },
  { localName: 'Palermo',          razonSocial: 'JIRO ONO S.R.L',                                             responsable: 'Leandro Rivello',                          phone: '1138484957', zona: 'CABA',       city: 'Buenos Aires',     address: 'Gorriti 3999' },
  { localName: 'Balvanera',        razonSocial: 'CASTRO CARLOS FABIAN',                                       responsable: 'Marcela Castro',                           phone: '1151796330', zona: 'CABA',       city: 'Buenos Aires',     address: 'Moreno 2299',                aliasMatchName: 'Jiro Sushi San Cristóbal' },
  { localName: 'Pilar',            razonSocial: 'ESTUDIO AVIGLIANO S.R.L.',                                   responsable: 'Luis Avigliano',                           phone: '2304217626', zona: 'GBA Norte',  city: 'Pilar',            address: 'Pedro Lagrave 776' },
  { localName: 'Plottier',         razonSocial: 'MARRONI MATIAS JAVIER Y MARRONI CRISTIAN MARCELO',           responsable: 'Cristian Marroni',                         phone: '2995198222', zona: 'Interior',   city: 'Plottier',         address: 'San Martín 50' },
  { localName: 'Quilmes',          razonSocial: 'JAUREGUI ROJAS CHRISTIAN MANUEL',                            responsable: 'JAUREGUI ROJAS CHRISTIAN MANUEL',          phone: '1161262468', zona: 'GBA Sur',    city: 'Quilmes',          address: 'San Martín 386' },
  { localName: 'Ramos Mejía',      razonSocial: 'BRYAN REYNALDO YARANGA HERRERA',                             responsable: 'Bryan Yaranga',                            phone: '1125505502', zona: 'GBA Oeste',  city: 'Ramos Mejía',      address: 'Alem 391' },
  { localName: 'Recoleta',         razonSocial: 'MILLAN BULLRICH JONAS',                                      responsable: 'MILLAN BULLRICH JONAS',                    phone: '1167193129', zona: 'CABA',       city: 'Buenos Aires',     address: '' /* dirección no provista por el usuario */ },
  { localName: 'Rosario',          razonSocial: 'SAMPOLI MARIA LAURA',                                        responsable: 'SAMPOLI MARIA LAURA',                      phone: '3417551295', zona: 'Interior',   city: 'Rosario',          address: 'España 578' },
  { localName: 'San Fernando',     razonSocial: 'IONNO FACUNDO PABLO',                                        responsable: 'Gonzalo Lavaselli',                        phone: '1130183426', zona: 'GBA Norte',  city: 'San Fernando',     address: 'Necochea 1129' },
  { localName: 'San Isidro',       razonSocial: 'NIEVES COLMENARES MARIA GRACIELA',                           responsable: 'NIEVES COLMENARES MARIA GRACIELA',         phone: '1124565912', zona: 'GBA Norte',  city: 'San Isidro',       address: 'Alsina 501' },
  { localName: 'San Miguel',       razonSocial: 'GUEVARA AGUSTIN ALBERTO JULIO',                              responsable: 'GUEVARA AGUSTIN ALBERTO JULIO',            phone: '1136343936', zona: 'GBA Oeste',  city: 'San Miguel',       address: 'Maestro Angel D Elia 1233' },
  { localName: 'San Telmo',        razonSocial: 'LOS OSCARES',                                                responsable: 'Federico Ofneira',                         phone: '1127905378', zona: 'CABA',       city: 'Buenos Aires',     address: 'Av. Caseros 482' },
  { localName: 'Ballester',        razonSocial: 'SERRA NATALIA PAOLA',                                        responsable: 'SERRA NATALIA PAOLA',                      phone: '1178885208', zona: 'GBA Norte',  city: 'Villa Ballester',  address: 'Alvear 2256' },
  { localName: 'Villa Crespo',     razonSocial: 'AMANO SRL',                                                  responsable: 'David Sequeira',                           phone: '1130001411', zona: 'CABA',       city: 'Buenos Aires',     address: 'Luis María Drago 192' },
  { localName: 'Villa del Parque', razonSocial: 'AMANO SRL',                                                  responsable: 'David Sequeira',                           phone: '1131670731', zona: 'CABA',       city: 'Buenos Aires',     address: 'Av. San Martín 5230' },
  { localName: 'Urquiza',          razonSocial: 'JAUREGUI ROJAS MICHAEL HUMBERTO',                            responsable: 'JAUREGUI ROJAS MICHAEL HUMBERTO',          phone: '1125028472', zona: 'CABA',       city: 'Buenos Aires',     address: 'Av. Triunvirato 5607',       aliasMatchName: 'Jiro Sushi Villa Urquiza' },
  { localName: 'Wilde',            razonSocial: 'JAUREGUI ROJAS ROCIO ELIZABETH',                             responsable: 'BOLIVAR MARTINEZ JERWINSON YOSUE',         phone: '1176231956', zona: 'GBA Sur',    city: 'Wilde',            address: 'Av. Mitre 6594' },
  { localName: 'Zárate',           razonSocial: 'SPINDOLA IVANA ALEJANDRA',                                   responsable: 'SPINDOLA IVANA ALEJANDRA',                 phone: '3487610212', zona: 'GBA Norte',  city: 'Zárate',           address: 'Castelli 811' },
  { localName: 'Posadas',          razonSocial: 'GRUPO PLANETA S.R.L.',                                       responsable: 'Flavia Iwanczuk',                          phone: '3764106029', zona: 'Interior',   city: 'Posadas',          address: 'Santa Fe 1446' },
];

async function main() {
  console.log(`🔄 Importing ${data.length} franquicias...\n`);
  let created = 0;
  let updated = 0;

  for (const f of data) {
    const targetName = `Jiro Sushi ${f.localName}`;
    const lookupName = f.aliasMatchName ?? targetName;

    const existing = await prisma.franchise.findFirst({ where: { name: lookupName } });

    const notes = `Razón Social: ${f.razonSocial}`;

    if (existing) {
      const updateData: Record<string, string> = {
        name: targetName,
        responsable: f.responsable,
        phone: f.phone,
        barrio: f.localName,
        zona: f.zona,
        city: f.city,
        notes,
      };
      // Don't blank out address if this row doesn't have one.
      if (f.address) updateData.address = f.address;

      await prisma.franchise.update({
        where: { id: existing.id },
        data: updateData,
      });
      updated++;
      const renamed = existing.name !== targetName ? ` (renamed from "${existing.name}")` : '';
      console.log(`  ✏️  updated: ${targetName}${renamed}`);
    } else {
      await prisma.franchise.create({
        data: {
          name: targetName,
          responsable: f.responsable,
          phone: f.phone,
          barrio: f.localName,
          zona: f.zona,
          city: f.city,
          address: f.address,
          notes,
          status: 'activa',
          active: true,
        },
      });
      created++;
      console.log(`  ➕ created: ${targetName}`);
    }
  }

  const totalInDb = await prisma.franchise.count({ where: { active: true } });
  console.log(
    `\n✅ Done: ${created} creadas, ${updated} actualizadas. Total activas en DB: ${totalInDb}`
  );
}

main()
  .catch((err) => {
    console.error('❌ Import failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
