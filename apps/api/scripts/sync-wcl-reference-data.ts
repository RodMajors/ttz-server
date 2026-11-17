import { PrismaService } from "../src/database/prisma.service";
import { WclBindingService } from "../src/warcraft-logs/wcl-binding.service";

const prisma = new PrismaService();

async function main() {
  try {
    const result = await new WclBindingService(prisma).syncReferenceData();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
