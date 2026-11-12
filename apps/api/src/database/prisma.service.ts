import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@ttz/database";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
