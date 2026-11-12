import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<{ status(code: number): { json(body: unknown): void } }>();
    const request = context.getRequest<{ requestId?: string }>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : undefined;
    const error = typeof payload === "object" && payload ? payload : { message: String(payload ?? "服务器内部错误") };
    if (status >= 500) this.logger.error(exception);

    response.status(status).json({
      error: {
        code: "code" in error ? error.code : status === 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED",
        message: "message" in error ? error.message : "请求失败",
        details: "details" in error ? error.details : undefined,
      },
      requestId: request.requestId,
    });
  }
}
