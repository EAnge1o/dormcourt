# 宿舍法院 DormCourt · 技术方案（PLAN）

- 版本：v1.3
- 日期：2026-11-17
- 依据：SPEC.md v1.0（已评审）
- 平台：Qoder Sites 全托管（静态前端 + Edge Function + 数据库）

## 0. v1.3 玩法扩展与体验加固（2026-11-17）

**平票加赛**：vote 模式开庭时若有票且最高票并列（≥2 项），先进入 `runoff` 状态（仅平票选项、90 秒倒计时、`runoff_options` 存下标、票数清零重投），决胜局内仍平票才在平票选项内随机。join/vote 对 open/runoff 开放，vote 在 runoff 中仅接受平票选项（否则 409 `runoff_required`）。条件更新保证并发下只进入一次。

**惩罚令**：开庭时按案由从惩罚池随机抽取存入 `punishment_text`（8 案由 × 3-4 条）。vote 模式败选方（投错或沉默者）受罚并展示名单，全票通过则惩罚作废；roulette 模式对命运选中者附加惩罚。复制判决书/分享文案携带惩罚令。

**新增案由**：lights（几点关灯）、ac（空调几度）、takeout（外卖谁去拿）、game（开黑谁背锅），配套像素图标（bulb/snow/gamepad）、判决书模板各 8 条、惩罚池与服务端白名单。

**体验加固（随本版）**：社交分享卡片（og meta + 1200×630 og.jpg + favicon.svg）；POST /cases 限流（按 IP 8 次/10 分钟内存窗口 + 按 created_by 5 次/10 分钟查库）；自动开庭/判决书失败重试指数退避（2s→30s 封顶）。

**schema 变更**：cases 增 `runoff_options jsonb`、`punishment_text text`；增索引 `cases_created_by_created_idx`。

---

## 0. v1.2 架构回退：Qoder 原生后端（2026-11-08）

**变更原因**：v1.1 因 Qoder Sites 后端配额 `backend_sites limit=0`（免费计划仅静态部署）改用自有 Supabase。经核实：比赛提供 **Qoder CN 一个月免费使用权益**（阿里云学生认证 → 300 元代金券 → Qoder CN 专业版），官方文档明确 Lite/Pro/Pro+/Ultra 个人计划支持 Sites 数据库与存储、且可"任何人可访问"公开分享。因此**弃用 Supabase，回归 Qoder 原生后端**（Edge Function + 平台数据库），待学生权益生效后按第 7 节流程部署（ensure_backend → 迁移 → prepare_site → 发布公开）。

**已完成回退（代码与验证）**：`functions/` 恢复（index.ts 平台 SDK 入口 + routes/templates + 可选 AI 代码）；`schema.sql` 恢复为 `app.` schema（无 `ai_bindings`，AI 已弃用）；`lib/api.ts` 恢复同源 `/functions/v1/app/api`；删除 `supabase/` 与 `.env.example`。本地 15 项 smoke 与 `npm run build` 均通过。

**AI 决策（不变）**：判决书采用已验证的 32 条分场景模板（免费、完整可参赛）。`verdict-ai.mjs` / `cloud-agents.mjs` 保留为可选代码但不部署调用，无需 Qoder PAT。

**保留不变**：SPEC 功能需求、像素风视觉、三路由页面、轮询/原子开庭/幂等机制、模板判决书；v1.0 第 3 节数据模型仍有效（`app.` schema，去掉 `ai_bindings`）。

---

## 1. 技术栈

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 前端 | Sites  bundled React starter（React + TypeScript + Vite，静态构建） | 平台一等支持；自带 UI 组件目录与本地 Function 代理 |
| 路由 | SPA 三路由，`prepare_site.spa = true` | 房间/案件链接可直接打开 |
| 样式 | 自定义像素风 CSS 层 + 消费 Nudge 设计变量 | 星露谷视觉；满足设计工作台契约 |
| 字体 | 开源中文像素字体（缝合像素 Fusion Pixel，自托管 woff2，`font-display: swap`，缺字回退系统字体） | 像素风核心；开源可商用 |
| 服务端 | 单个 `app` Edge Function（Deno，`functionDirectory/index.ts`） | 平台约束：全部服务端逻辑进 Function |
| 数据 | Function 后端数据库（`databaseAccessModel: function_backend`，Supabase 适配器由平台注入） | 房间/投票/历史云端持久化；Function 代码负责业务鉴权 |
| AI | QCA Managed API，bundled `cloud-agents.mjs` 客户端，`QODER_PAT` 仅存在于 Function 侧 | 判决书生成；浏览器只拿应用内容 |
| 实时 | 短轮询 2.5s（满足 SPEC ≤3s） | 无需 WebSocket，架构最简 |

## 2. 架构与调用链

```
浏览器（React SPA）
  │  same-origin /functions/v1/app/api/*
  ▼
app Edge Function（Deno）
  ├─ 业务路由：房间/案件/投票/开庭/判决书
  ├─ 数据库（平台注入 SDK，Function 内读写）
  └─ /api/cases/:id/verdict → QCA Managed API（QODER_PAT）
                               └─ 超时/失败 → 内置模板库兜底
```

- 免登录：路由全部匿名可访问；身份 = 客户端生成的 `voterId`（UUID，存 localStorage）+ 用户自填昵称。
- 防重复票：服务端 `(case_id, voter_id)` 主键 upsert，票数由投票表聚合得出，不做计数器，天然避免并发竞争。

## 3. 数据模型（schema.sql，走平台迁移流程）

```text
rooms
  id uuid PK, name text, created_at timestamptz

cases
  id uuid PK, room_id uuid → rooms,
  scenario text,            -- eat / express / duty / custom
  question text,
  mode text,                -- vote | roulette
  options jsonb,            -- string[]，2–8 项
  deadline_at timestamptz,  -- null = 手动开庭
  status text,              -- open | decided
  result_index int,         -- 开庭后写入
  verdict_text text, verdict_source text,   -- ai | template
  verdict_status text,      -- none | pending | ready
  created_by uuid,          -- 发起人 voterId
  created_at, decided_at timestamptz

case_members
  case_id uuid, voter_id uuid, nickname text,
  choice int,               -- vote 模式 = 选项下标；roulette 模式 = null（见证人）
  updated_at timestamptz,
  PRIMARY KEY (case_id, voter_id)

索引：cases(room_id, created_at DESC)；case_members 由主键覆盖
```

房间是持久实体：首次创建决策时自动建房；房间页可"再开一庭"，历史列表来自 `cases(room_id)`。分享链接直达 `/case/:id`。

## 4. API 契约（same-origin `/functions/v1/app/api`）

| 方法 路径 | 入参 | 出参 | 说明 |
| --- | --- | --- | --- |
| POST /rooms | name? | {room} | 建房（也可由 POST /cases 隐式创建） |
| POST /cases | roomId?, scenario, question, mode, options[], durationSec?, voterId | {room, case} | 创建案件；无 roomId 则建房；created_by=voterId |
| GET /rooms/:id | — | {room, cases[]} | 房间信息 + 历史案件列表 |
| GET /cases/:id | — | {case, counts[], members[], verdict} | 轮询端点；counts 由聚合得出 |
| POST /cases/:id/join | voterId, nickname | {member} | 幂等 upsert；roulette 模式即"在场见证" |
| POST /cases/:id/vote | voterId, optionIndex | {member} | 仅 open 状态；upsert 改票 |
| POST /cases/:id/decide | voterId | {case} | 条件更新 open→decided，仅成功者计算结果 |
| POST /cases/:id/verdict | — | {verdict} | 幂等生成判决书；pending 超 30s 可重试 |

错误统一 `{error:{code,message}}`；不暴露上游原始错误。

### 关键机制

- **原子开庭**：`UPDATE cases SET status='decided'… WHERE id=? AND status='open'`（条件更新）。多个客户端同时触发（倒计时归零/提前开庭）只有一个成功，其余读已决状态。结果在状态翻转后按当前票数计算：最高票→平票随机→零票全随机；roulette 均匀随机。
- **权限**：提前开庭仅 created_by；到期后任何人可触发自动开庭（服务端校验 deadline_at）。投票/开庭后写入一律拒绝。
- **判决书幂等**：verdict_status none→pending 条件更新防重复生成；QCA 调用限时 ~8s，超时/失败写模板判决书（source=template），用户无感知；pending 卡死 >30s 允许重试。
- **轮询策略**：open 状态每 2.5s GET case；decided 后停止轮询，仅在 verdict 未 ready 时续询判决书。

## 5. 前端页面

| 路由 | 页面 | 要点 |
| --- | --- | --- |
| `/` | 创建台 | 首屏即创建：3 场景卡 + 自定义；选项编辑器（2–8）；模式/时长选择；创建后进入法庭 |
| `/case/:id` | 法庭 | 加入（昵称）→ 投票/见证 → 倒计时 → 开庭动画 → 结果 + 判决书 → 复制分享；open 轮询 |
| `/room/:id` | 法院档案 | 本房间历史案件列表、回看判决书、"再开一庭" |

### 像素风视觉方案（星露谷方向）

- 色板：羊皮纸 `#f4e4c1`、木棕 `#8b5a2b`、深墨 `#3a2e2a`、草绿 `#6abe30`、印章红 `#c0392b`，暖色田园调。
- UI 语法：像素描边面板（box-shadow 阶梯角）、星露谷式双层边框对话框、按钮 2px 按下位移、禁用态灰化。
- 像素素材：ImageGen 生成法院门脸横幅与法槌 sprite（像素风、透明/纯色底）；其余用 CSS 绘制，控制体积。
- 开庭动画：选项格子走马灯高亮（轮盘）/ 法槌落下（投票），2–4s，可点击跳过。
- 判决书：羊皮纸卡片 + 像素红章"裁决生效"，案号用房间/案件短 ID 戏仿。
- 设计工作台：`open_design_workbench` 注册 3 页面与 appearance/radius/spacing/typography/motion 变量，样式全部消费变量。

## 6. 本地开发与验证

- 脚手架：`node <skill>/scripts/create-site.mjs <project-root>` → `npm ci` → `npm run dev`。
- Function 本地模式：按 function-backend 示例注入无凭据内存依赖，跑真实路由（创建→投票→开庭→模板判决书）。
- 前端先行：创建台 + 法庭先用本地适配器跑通，再做云接入。
- Deno 不可用时记录待验证项，不以前端检查冒充 Function 验证。

## 7. 云端接入与发布顺序

1. `get_context` → `open_design_workbench`（名称：宿舍法院 DormCourt）
2. `ensure_backend`：database + functions（function_backend）
3. schema 迁移：create_database_migration → 审阅 → apply → get_database_schema 取 schemaRef
4. **QCA 确认门**：开启 `qoder` 能力前必须向用户明确确认（平台将自动创建 QODER_PAT 并配置到站点后端）——实现到 AI 步骤时单独询问
5. `prepare_site`（spa、webDirectory、functionDirectory、databaseAccess read_write + schemaRef）
6. sites-hosting 发布 → 公开访问（参赛要求）
7. 线上验收：真实创建→双浏览器投票→开庭→真实 AI 判决书→历史

## 8. 风险与对策

| 风险 | 对策 |
| --- | --- |
| QCA 延迟/不可用 | 8s 超时 + ≥30 条分场景模板兜底（SPEC FR-06） |
| 像素字体体积 | woff2 自托管 + font-display swap + 系统字体回退 |
| 并发开庭/重复票 | 条件更新 + 主键 upsert + 聚合计数 |
| 轮询压力 | decided 即停；宿舍规模（<10 人/房间）无压力 |
| Function 冷启动延迟 | 首屏不依赖 Function（创建台纯前端），首次交互才调用 |