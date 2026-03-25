import { PrismaClient, UserRole, SiteType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding TenderWatch-Live...');

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

  const sites: Array<{
    key: string;
    name: string;
    baseUrl: string;
    type: SiteType;
    enabled: boolean;
  }> = [
    {
      key: 'bihar_nic',
      name: 'Bihar NIC eProc',
      baseUrl: 'https://eproc.bihar.gov.in/nicgep/app',
      type: SiteType.NIC_GEP,
      enabled: false,
    },
    {
      key: 'cg_nic',
      name: 'Chhattisgarh NIC eProc',
      baseUrl: 'https://eproc.cgstate.gov.in/nicgep/app',
      type: SiteType.NIC_GEP,
      enabled: false,
    },
    {
      key: 'cppp',
      name: 'Central Public Procurement Portal (CPPP)',
      baseUrl: 'https://eprocure.gov.in/eprocure/app',
      type: SiteType.CPPP,
      enabled: true,
    },
    {
      key: 'gem',
      name: 'GeM Bid Listing',
      baseUrl: 'https://bidplus.gem.gov.in/all-bids',
      type: SiteType.GEM,
      enabled: true,
    },
    {
      key: 'ireps',
      name: 'Indian Railways IREPS',
      baseUrl: 'https://www.ireps.gov.in',
      type: SiteType.IREPS,
      enabled: false,
    },
    {
      key: 'jharkhand_nic',
      name: 'Jharkhand NIC eProc',
      baseUrl: 'https://jharkhandtenders.gov.in/nicgep/app',
      type: SiteType.NIC_GEP,
      enabled: true,
    },
    {
      key: 'karnataka_nic',
      name: 'Karnataka NIC eProc',
      baseUrl: 'https://eproc.karnataka.gov.in/nicgep/app',
      type: SiteType.NIC_GEP,
      enabled: false,
    },
    {
      key: 'maha_nic',
      name: 'Maharashtra NIC eProc',
      baseUrl: 'https://mahatenders.gov.in/nicgep/app',
      type: SiteType.NIC_GEP,
      enabled: true,
    },
    {
      key: 'mp_nic',
      name: 'Madhya Pradesh NIC eProc',
      baseUrl: 'https://mptenders.gov.in/nicgep/app',
      type: SiteType.NIC_GEP,
      enabled: true,
    },
    {
      key: 'nprocure',
      name: 'nProcure eProcurement',
      baseUrl: 'https://tender.nprocure.com',
      type: SiteType.NPROCURE,
      enabled: false,
    },
    {
      key: 'odisha_nic',
      name: 'Odisha NIC eProc',
      baseUrl: 'https://tendersodisha.gov.in/nicgep/app',
      type: SiteType.NIC_GEP,
      enabled: true,
    },
    {
      key: 'rajasthan_nic',
      name: 'Rajasthan NIC eProc',
      baseUrl: 'https://eproc.rajasthan.gov.in/nicgep/app',
      type: SiteType.NIC_GEP,
      enabled: true,
    },
    {
      key: 'tn_nic',
      name: 'Tamil Nadu NIC eProc',
      baseUrl: 'https://tntenders.gov.in/nicgep/app',
      type: SiteType.NIC_GEP,
      enabled: false,
    },
    {
      key: 'up_nic',
      name: 'Uttar Pradesh NIC eProc',
      baseUrl: 'https://etender.up.nic.in/nicgep/app',
      type: SiteType.NIC_GEP,
      enabled: true,
    },
  ];

  for (const site of sites) {
    await prisma.sourceSite.upsert({
      where: { key: site.key },
      update: {
        name: site.name,
        baseUrl: site.baseUrl,
        type: site.type,
      },
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