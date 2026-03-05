import { PrismaClient, UserRole, SiteType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding TenderWatch-Live...');

  // ── 1. Seed Users ──
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@local';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const bdEmail = process.env.BD_EMAIL || 'bd@local';
  const bdPass = process.env.BD_PASSWORD || 'bd123';

  const adminHash = await bcrypt.hash(adminPass, 12);
  const bdHash = await bcrypt.hash(bdPass, 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash: adminHash, role: UserRole.ADMIN },
    create: { email: adminEmail, passwordHash: adminHash, role: UserRole.ADMIN },
  });
  console.log(`  ✅ Admin user: ${adminEmail}`);

  await prisma.user.upsert({
    where: { email: bdEmail },
    update: { passwordHash: bdHash, role: UserRole.BD },
    create: { email: bdEmail, passwordHash: bdHash, role: UserRole.BD },
  });
  console.log(`  ✅ BD user: ${bdEmail}`);

  // ── 2. Seed Source Sites ──
  const sites: Array<{
    key: string;
    name: string;
    baseUrl: string;
    type: SiteType;
    enabled: boolean;
  }> = [
    // Keep defaults here. You will control enabled/baseUrl/type via DB updates.
    {
      key: 'cppp',
      name: 'Central Public Procurement Portal (CPPP)',
      baseUrl: 'https://eprocure.gov.in/eprocure/app',
      type: SiteType.CPPP,
      enabled: false,
    },
    {
      key: 'jharkhand_nic',
      name: 'Jharkhand NIC eProc',
      baseUrl: 'https://jharkhandtenders.gov.in/nicgep/app',
      type: SiteType.NIC_GEP,
      enabled: false,
    },
    {
      key: 'up_nic',
      name: 'Uttar Pradesh NIC eProc',
      baseUrl: 'https://etender.up.nic.in/nicgep/app',
      type: SiteType.NIC_GEP,
      enabled: false,
    },
  ];

  for (const site of sites) {
    await prisma.sourceSite.upsert({
      where: { key: site.key },
      // IMPORTANT: do NOT overwrite operational toggles in update
      update: {
        name: site.name,
        baseUrl: site.baseUrl,
        type: site.type,
      },
      // only used first time
      create: site,
    });

    console.log(`  ✅ Ensured site exists: ${site.key}`);
  }

  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });