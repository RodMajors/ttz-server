# TTZ Server

TTZ 公会站后端仓库。NestJS API、BullMQ worker、Prisma schema 和后端共享 Zod contracts 均在此维护。

## 目录

- apps/api：NestJS REST API、Swagger、微信登录、活动、报名、名单、出勤、WCL 和公开内容。
- apps/worker：BullMQ 后台任务；生产初始并发为 1。
- packages/contracts：后端请求 DTO 与枚举的 Zod 单一事实来源。
- packages/database：Prisma schema 与迁移。
- packages/config：环境变量校验。

前端、小程序位于独立的 ttz 仓库；需求和设计文档位于同级 docs 目录。跨仓接口以 REST + Swagger 为边界，两个仓库中的客户端/服务端 contracts 版本必须在同一功能阶段同步提交。

## 本地开发

需要 Node.js 26.13.1 与 pnpm 12.18.0。

1. 将 .env.example 复制为 .env 并填写本地 MySQL、Redis、微信和 WCL 配置。
2. 执行 pnpm install。
3. 执行 pnpm db:generate。
4. 执行 pnpm dev。

API 默认监听 http://localhost:3001/api。非生产环境 Swagger 位于 /api/docs。生产环境不公开 Swagger。

Web 使用 HttpOnly、SameSite=Strict 的不透明会话 Cookie；小程序使用短期 access token 与可轮换 refresh token。数据库只保存 token 哈希。二维码只携带短期 loginNo 与 nonce，浏览器密钥通过 x-ttz-browser-secret 请求头轮询，确认后只能原子消费一次。

## 数据库安全

迁移只在本地或临时库评审、演练。任何命令都不会自动连接或修改生产数据库；生产执行前必须备份并由维护者显式运行 prisma migrate deploy。

## 提交

Husky 的 pre-commit 会运行 lint-staged、全仓类型检查和单元测试。提交信息使用 Conventional Commits。
