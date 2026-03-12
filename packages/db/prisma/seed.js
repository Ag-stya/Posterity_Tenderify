const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding productivity score rules...');
  const rules = [
    { actionType: 'STAGE_COMPLETED', stage: 'TENDER_IDENTIFICATION', scoreValue: 4 },
    { actionType: 'STAGE_COMPLETED', stage: 'DUE_DILIGENCE', scoreValue: 6 },
    { actionType: 'STAGE_COMPLETED', stage: 'PRE_BID_MEETING', scoreValue: 5 },
    { actionType: 'STAGE_COMPLETED', stage: 'TENDER_FILING', scoreValue: 10 },
    { actionType: 'STAGE_COMPLETED', stage: 'TECH_EVALUATION', scoreValue: 8 },
    { actionType: 'STAGE_COMPLETED', stage: 'PRESENTATION_STAGE', scoreValue: 8 },
    { actionType: 'STAGE_COMPLETED', stage: 'FINANCIAL_EVALUATION', scoreValue: 7 },
    { actionType: 'STAGE_COMPLETED', stage: 'CONTRACT_AWARD', scoreValue: 15 },
    { actionType: 'STAGE_COMPLETED', stage: 'PROJECT_INITIATED', scoreValue: 6 },
    { actionType: 'STAGE_COMPLETED', stage: 'PROJECT_COMPLETED', scoreValue: 12 },
    { actionType: 'NOTE_ADDED', stage: null, scoreValue: 1 },
    { actionType: 'STAGE_ASSIGNED', stage: null, scoreValue: 1 },
    { actionType: 'TENDER_REJECTED', stage: null, scoreValue: 0 },
    { actionType: 'WORKFLOW_ENTERED', stage: null, scoreValue: 2 },
    { actionType: 'STAGE_CHANGED', stage: null, scoreValue: 1 },
  ];
  const existing = await prisma.productivityScoreRule.count();
  if (existing === 0) {
    await prisma.productivityScoreRule.createMany({ data: rules });
    console.log(`Seeded ${rules.length} rules`);
  } else {
    console.log(`Already seeded (${existing} rules), skipping`);
  }
}
main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());