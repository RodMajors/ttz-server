# TTZ Server

TTZ 公会站后端 Monorepo，维护 NestJS REST API、BullMQ WCL Worker、Prisma schema、环境校验和服务端共享 contracts。前端与小程序位于同级 `ttz` 仓库，需求和设计位于同级 `docs`。

## 目录结构

```text
ttz-server/
├─ apps/
│  ├─ api/                    NestJS API、Swagger、业务模块和 Vitest
│  └─ worker/                 BullMQ WCL 导入 Worker，并发固定为 1
├─ packages/
│  ├─ config/                 @nestjs/config 使用的 Zod 环境变量校验
│  ├─ contracts/              服务端 DTO 与业务枚举的事实来源
│  ├─ database/               Prisma schema、client 导出和待评审 migration
│  └─ warcraft-logs/          WCL OAuth2 / GraphQL 客户端与测试
├─ .github/workflows/ci.yml  后端 CI
├─ .husky/pre-commit         格式、类型与单元测试门禁
└─ turbo.json                build/typecheck/test 任务
```

## 业务模块

- `auth`：微信 code2Session、可轮换小程序 token、Web HttpOnly Cookie、一次性二维码登录。
- `members`：审核、停用、privilege、当前身份组、角色和通知偏好。
- `activities`：活动状态机、报名、审批、名单、锁定和并发版本控制。
- `attendance`：人工出勤、个人/管理视图和统计。
- `warcraft-logs`：报告登记、队列、角色匹配、出勤建议和人工记录保护。
- `announcements`：置顶、定时、到期、全员/当前身份组投放。
- `public`：公开公会资料、招募、联系方式、工具链接和 WCL 摘要；管理员结构化设置写入。

## 已实现的业务约束

- 正常出勤和迟到计为有效出勤；没有早退状态。请假、缺席、替补和未报名不计入。
- 普通成员只有在报名截止前、名单未锁定且报名尚未确认时才能修改或取消。负责人/管理员仍可调整。
- 身份组只保存当前标签，不授予权限，不做活动时快照。
- 名单不保留变更历史，依靠活动 version 防止并发静默覆盖。
- 本期不实现站位图和团本准备事项。
- 人工确认的出勤不会被后续 WCL 建议覆盖。

## 本地开发

要求 Node.js 26.13.1 与 pnpm 12.18.0。

```bash
pnpm install
pnpm db:generate
pnpm dev
```

修改 `packages/database/prisma/schema.prisma` 后，先运行 `pnpm db:validate`。本地开发数据库应用已提交的 migration 使用 `pnpm db:migrate`；查看应用状态使用 `pnpm db:migrate:status`。迁移后运行 `pnpm db:generate` 更新 Prisma Client。`db:migrate` 会实际修改 `.env` 中 `DATABASE_URL` 指向的数据库，只应在本地开发库使用。

复制 `.env.example` 为仓库根目录的 `.env`。API 与 Worker 的 `dev` / `start` 命令均在执行入口前通过 Node `--env-file=../../.env` 加载该文件；已有环境变量优先。主要变量：

- `DATABASE_URL`：MySQL 连接。不要在文档或仓库中提交生产凭证。
- `REDIS_URL` / `REDIS_ENABLED`：Redis 与 Worker 开关。
- `WEB_ORIGIN`：唯一允许携带 Cookie 的 Web Origin。
- `WECHAT_APP_ID` / `WECHAT_APP_SECRET`：微信服务端凭证。
- `WCL_CLIENT_ID` / `WCL_CLIENT_SECRET`：Warcraft Logs client credentials。
- `WCL_REGION`：`cn` 或 `global`，控制 GraphQL 数据区；OAuth 固定使用全球 OAuth endpoint。
- `WCL_REDIRECT_URI`：已在 WCL Client 登记的完全匹配回调 URL。API 本地默认监听 `3001`，建议登记 `http://127.0.0.1:3001/api/auth/wcl/callback`；生产回调为 `https://api.ttzwow.com/api/auth/wcl/callback`。若 WCL Client 尚未登记这些 URI，应先在 Client 配置中添加。
- `SESSION_COOKIE_NAME`、`SESSION_TTL_SECONDS`、`QR_SESSION_TTL_SECONDS`：会话配置。
- `ALLOW_DEV_AUTH_HEADER`：仅非生产本地调试；生产代码永远忽略开发身份头。

API 默认监听 `http://localhost:3001/api`，非生产 Swagger 位于 `/api/docs`。

## 运行和构建

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm db:validate

pnpm --filter @ttz/api start
pnpm --filter @ttz/worker start
```

API 输出 `apps/api/dist/server.cjs`，Worker 输出 `apps/worker/dist/worker.cjs`。`REDIS_ENABLED=false` 时 Worker 会安全退出，基础 API 仍可运行。

## 会话安全

- 数据库只保存 access/refresh token 哈希。
- refresh token 原子轮换；竞争请求只有一个成功。
- 二维码只含短期 `loginNo` 与 nonce；浏览器密钥不进入二维码。
- Web 确认在同一事务内消费二维码并创建会话。
- 账号停用时撤销全部服务端会话。
- 日志不得写入 token、Cookie、AppSecret 或 session_key。

## 数据库基线与迁移

维护者已明确执行 `docs/TTZ-后续迁移-提醒与出勤.sql`，因此不要重复执行。该脚本增加：

- `attendance_records.manually_confirmed`；
- `notification_preferences` 及现有用户默认行。

Prisma schema 还映射 MVP 草案中的 `announcements`、`announcement_groups` 和 `site_settings`。映射不等于创建表。若基础 `TTZ-MVP-数据库变更草案.sql` 尚未完整执行，公告/公开设置接口会在运行时失败；部署前必须使用 `INFORMATION_SCHEMA` 核对真实表与字段。

本地开发数据库最初由维护者手工建表，因此 `_prisma_migrations` 使用纯结构 baseline，并保留 baseline 后的三条增量 migration。对已有手工库需核对实际结构与 baseline 一致后再执行 `pnpm db:migrate:baseline`；该命令只登记 schema baseline，不执行基线建表语句。

baseline 后的增量 migration 是 `auth_sessions`、WCL 出勤建议和手工出勤确认，保持在正常迁移链中。后续结构变更从它们之后新增普通 Prisma migration。

全新空库可使用 `prisma migrate deploy` 建立 baseline；已有手工建好的数据库必须先核对结构与 schema 完全一致，再使用 `prisma migrate resolve --applied <baseline-name>` 登记，不能先对其运行 `migrate deploy`。`_prisma_migrations` 是 Prisma 创建和维护的迁移元数据表，不含业务数据。生产环境仍须先备份并在结构副本演练；不得将本机数据库凭据或本地数据快照带入生产流程。

## CI 与提交

GitHub Actions 使用 Node 26.13.1 / pnpm 12.18.0，执行依赖安装、Prisma 生成/校验、类型检查、单元测试和 API/Worker 构建；CI 使用占位数据库 URL，不连接生产库。

Husky pre-commit 运行 lint-staged、全仓类型检查和测试。提交使用 Conventional Commits。
