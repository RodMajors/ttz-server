import { Controller, Get, Inject } from "@nestjs/common";
import { Public } from "../auth/auth.decorators";
import { PrismaService } from "../database/prisma.service";

@Public()
@Controller("public")
export class PublicController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  @Get("guild") guild() {
    return this.setting("guild_profile");
  }
  @Get("recruitment") recruitment() {
    return this.setting("recruitment");
  }
  @Get("contact") contact() {
    return this.setting("contact");
  }
  @Get("tools") tools() {
    return this.setting("tool_links");
  }
  @Get("progress") progress() {
    return { source: "WCL", region: "CN", serverId: 569, raids: [] };
  }
  private async setting(key: string) {
    const setting = await this.prisma.siteSetting.findUnique({ where: { key } });
    return setting?.jsonValue ?? {};
  }
}
