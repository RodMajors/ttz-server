import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { WinstonModule } from "nest-winston";
import { format, transports } from "winston";
import { AppModule } from "./app.module";
import { ApiInterceptor } from "./common/api.interceptor";
import { ApiExceptionFilter } from "./common/api-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
      transports: [new transports.Console()],
    }),
  });
  app.setGlobalPrefix("api");
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000", credentials: true });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new ApiInterceptor());
  if (process.env.NODE_ENV !== "production") {
    const config = new DocumentBuilder()
      .setTitle("TTZ API")
      .setDescription("TTZ 公会站 REST API")
      .setVersion("0.1")
      .build();
    SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, config));
  }
  await app.listen(Number(process.env.PORT ?? 3001));
}
void bootstrap();
