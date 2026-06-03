# AI 绩效考评系统 PRD / 功能设计文档

> 目标：本文档用于让另一位大模型在没有阅读原始代码的情况下，尽可能复刻出与当前项目一致的系统。文档覆盖产品目标、用户流程、页面状态、接口、数据结构、AI 提示词约束、评分规则、报告呈现与非功能要求。

## 1. 产品概述

### 1.1 产品名称

AI 绩效考评系统（人才价值数字化评估系统）。

### 1.2 产品定位

面向 HR、业务主管、绩效评审专家的本地化 AI 绩效审计与人才价值评估工具。系统通过上传绩效合同、岗位说明/胜任力模型、简历与分指标交付物，自动完成：

1. 绩效合同指标解析；
2. 每个指标的证据材料审计；
3. 规则引擎复算与 AI 兜底评分；
4. 价值创造专项加分；
5. 岗位胜任力/潜力雷达图分析；
6. 人工校准；
7. 数字化人才价值评估报告生成与历史记录查看。

### 1.3 核心设计原则

- **指标先行**：必须先解析绩效合同，得到指标列表，再要求用户针对每个指标分别上传交付物。
- **分指标独立审计**：一个指标只审计该指标绑定的文件，避免泛化使用其它指标材料。
- **证据优先**：所有评分、结论、价值创造与能力判断都应尽量引用交付物文本证据。
- **非纪要实质证据约束**：会议纪要可作为佐证，但没有非纪要实质证据时，不允许仅凭会议纪要直接判定指标完成。
- **本地模型优先**：默认通过本地 OpenAI 兼容接口调用大模型，服务端提供 AI 代理以规避 CORS 并保护 API Key。
- **内存态交付版**：当前实现以服务端内存保存任务，不包含持久化数据库；上传文件保存在本地 `uploads/` 目录。

## 2. 目标用户与场景

### 2.1 目标用户

| 用户 | 主要诉求 |
| --- | --- |
| HR/组织发展人员 | 标准化绩效评审、统一话术、生成报告 |
| 业务主管/评审经理 | 快速审阅交付物证据、人工校准 AI 结果 |
| 被评估员工/专家人才 | 获得基于证据的绩效与能力评价 |
| 系统管理员 | 配置本地模型接口、检查文件解析链路 |

### 2.2 典型业务场景

1. 评审人员上传员工绩效合同，系统解析出指标。
2. 系统展示指标卡片，要求用户对每个指标上传对应交付物。
3. 系统逐指标分析材料，提取证据点、完成状态、实际达成数值与评分依据。
4. 系统按权重计算目标达成分，并额外评估合同职责之外的价值创造分。
5. 系统结合岗位说明/胜任力模型与简历，生成岗位匹配度与能力雷达图。
6. 评审经理人工校准“目标达成”和“价值创造”得分。
7. 系统生成最终数字化人才价值评估报告，并允许查看历史任务与下载源文件。

## 3. 范围说明

### 3.1 本期范围

- AI 配置：本地 OpenAI 兼容模型 URL、模型名、API Key 配置。
- 任务创建：员工信息、岗位、考核周期、绩效合同、岗位说明/胜任力模型、简历录入。
- 文件解析：PDF、Office、Excel、图片等文件文本提取；PDF/图片可接入本地 VLM/OCR。
- 合同指标解析：提取指标分类、标题、目标描述、权重、里程碑。
- 分指标材料上传：每个指标上传一份或多份交付物。
- 文件级审计：逐文件识别证据、数字事实、会议纪要属性与单文件完成判断。
- 指标汇总审计：按指标汇总多文件结果，形成证据链与指标评分。
- 规则复算：对数字类、百分比类、数量类、负向数值类、里程碑类指标复算分数。
- 价值创造评估：0-10 分专项加分。
- 能力分析：岗位适配度、能力雷达图、强弱项与建议。
- 报告：概览、指标明细、能力分析三层报告视图。
- 人工校准：目标达成、价值创造两类校准项。
- 历史记录：当前进程内任务列表与任务详情恢复。
- 源文件下载：按文件名下载任务关联的合同或交付物。

### 3.2 非本期范围

- 多租户、权限、登录认证。
- 数据库持久化与任务跨进程恢复。
- 审批流/电子签名。
- 企业通讯录与组织架构同步。
- 多模型路由与在线模型供应商管理（当前只支持 `provider=local`）。

## 4. 信息架构与页面

### 4.1 全局导航

系统采用左侧导航/步骤式工作台，至少包含：

1. 新建评估；
2. 证据上传；
3. 处理状态；
4. 人工校准；
5. 评估报告；
6. 历史记录；
7. AI 设置弹窗。

### 4.2 新建评估页

#### 4.2.1 输入项

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| 员工编号 `employee_id` | 是 | 任意字符串 |
| 员工姓名 `employee_name` | 是 | 报告展示姓名 |
| 岗位名称 `job_name` | 是 | 如“高级技术架构师” |
| 考核周期开始 `start` | 是 | 日期字符串 |
| 考核周期结束 `end` | 是 | 日期字符串 |
| 绩效合同 | 是 | 支持上传文件后解析，也支持手动编辑合同文本 |
| 岗位说明/胜任力指标 | 否 | 支持文件解析或文本录入；系统只稳定提取“能力项”列 |
| 简历信息 | 否 | 支持文件解析或文本录入 |

#### 4.2.2 交互规则

- 上传绩效合同后，系统调用快速文件解析接口展示预览文本。
- 用户可切换为手动编辑合同文本。
- 创建任务时，绩效合同文本长度必须不少于 20 个字符。
- 创建成功后进入“证据上传”页。
- 创建失败时停留在状态页，状态为 `PARSE_FAILED`，展示错误消息。

### 4.3 证据上传页

#### 4.3.1 功能

- 展示从绩效合同解析出的每个指标。
- 每个指标具有独立文件上传区。
- 用户可对每个指标上传一份或多份交付物。
- 未上传文件的指标在审计时直接判为未完成、0 分。
- 页面提示：针对绩效合同中的每一个具体指标上传对应交付物；会议纪要执行特殊判定逻辑。

#### 4.3.2 上传策略

- 前端每个指标保存 `metricFiles[clause_id]`。
- 单文件上传时调用 `/api/v1/files/upload` 提取文本，并把 `rawFile`、文件名、文本保存在前端状态。
- 通用分批暂存上传接口为 `/api/v1/evaluation/tasks/stage`，每批 3 个文件，最多 20 个文件/请求。

### 4.4 状态页

状态页展示当前任务进度与日志，典型状态：

| 状态 | 说明 |
| --- | --- |
| `PARSING` | 解析绩效合同指标 |
| `EVIDENCE_READY` | 指标解析完成，等待上传证据 |
| `AUDITING` | 正在逐指标审计材料 |
| `COMPLETED` | 审计与报告生成完成 |
| `FAILED` | 评估失败 |
| `PARSE_FAILED` | 合同解析失败 |

### 4.5 人工校准页

#### 4.5.1 默认校准项

| 校准项 | 分值范围 | 默认值 |
| --- | --- | --- |
| 业绩贡献 - 目标达成 | 建议 0-120 | AI 计算的目标达成分 |
| 业绩贡献 - 价值创造 | 建议 0-10 | AI 计算的价值创造分 |

#### 4.5.2 交互

- 评审人可输入分数与评语。
- 提交后写入 `manual_calibrations`。
- 服务端生成最终报告。
- 前端轮询 `/api/v1/evaluation/tasks/:task_id/report`，拿到报告后进入报告页。

### 4.6 报告页

报告页至少包含三个 Tab：

1. **概览**：总分、等级、综合评价、核心优势、待改进、价值创造、能力分析摘要。
2. **指标明细**：逐指标展示标题、分类、权重、目标基准、实际达成、完成状态、分数、证据摘要、审计溯源。
3. **能力明细**：岗位匹配度、雷达图、能力强项、能力弱项、建议，每个能力维度展示结论、证据/依据、逻辑。

报告需要体现：

- 员工信息与考核周期；
- 总分、目标达成分、价值创造分；
- 指标数、里程碑数、完成率；
- 分类达成度；
- 证据链列表；
- 评分规则调试信息（可折叠）。

### 4.7 历史记录页

- 获取当前进程内非 `STAGING` 任务列表。
- 展示员工姓名、岗位、考核周期、最终分、等级、状态、创建时间。
- 点击任务后恢复任务 ID，并拉取指标、结果、证据、报告相关数据。

### 4.8 AI 设置弹窗

字段：

| 字段 | 说明 |
| --- | --- |
| `provider` | 固定/默认为 `local` |
| `localUrl` | OpenAI 兼容服务地址，可为基础地址或 `/chat/completions` |
| `localModel` | 本地模型名称 |
| `localApiKey` | 可选，作为 Bearer Token |
| `temperature` | 可选，审计评分会强制不高于 0.01 |

## 5. 端到端流程

### 5.1 主流程

1. 用户打开系统，配置本地模型接口。
2. 用户在新建评估页填写员工信息、考核周期。
3. 用户上传/录入绩效合同；可上传岗位说明/胜任力模型与简历。
4. 系统使用 AI 解析合同指标，生成 `clauses`。
5. 系统创建/更新任务，状态为 `PENDING_EVIDENCE`。
6. 用户进入证据上传页，为每个指标上传交付物。
7. 用户点击开始评估。
8. 系统对每个指标：
   1. 压缩/截断大文件文本；
   2. 并发执行文件级审计；
   3. 汇总多文件审计；
   4. 生成证据点；
   5. 按规则引擎复算分数或 AI 兜底；
   6. 同步增量证据到服务端。
9. 系统汇总所有指标，按权重计算目标达成分。
10. 系统评估价值创造，得到 0-10 分。
11. 系统结合岗位模型与简历生成能力分析。
12. 系统生成综合总结与报告数据，状态为 `REPORT_READY`。
13. 用户进入报告页或人工校准页。
14. 用户提交人工校准后，服务端生成最终报告并返回。

### 5.2 失败流程

- 合同缺失/过短：抛出“绩效合同内容缺失或过短”。
- 合同解析无指标：抛出“未能从合同中解析出有效指标”。
- AI 调用失败：前端最多重试 5 次，指数退避；最终展示“AI 服务暂时无法响应”。
- 上传负载过大：提示 413 Payload Too Large，建议缩减文件数量或分批上传。
- 文件审计单个 AI 调用失败：该文件返回“文件审计失败”兜底 JSON，不中断整个流程。
- 指标汇总 AI 调用失败：该指标返回“汇总审计失败”兜底 JSON，不中断其它指标。

## 6. 数据模型

### 6.1 EvaluationTask

```ts
interface EvaluationTask {
  task_id: string;
  status: string;
  progress: number;
  employee_id: string;
  employee_name: string;
  job_name: string;
  assessment_period: { start: string; end: string };
  deliverable_files: UploadedFile[];
  contract_file?: UploadedFile;
  evidences: Evidence[];
  clauses: Clause[];
  clause_results: ClauseResult[];
  value_creation?: ValueCreation;
  manual_calibrations: ManualCalibration[];
  report?: GeneratedReport;
  overall_summary?: OverallSummary;
  category_stats?: CategoryStat[];
  competency_analysis?: CompetencyAnalysis;
  debug_scoring_details?: any[];
  created_at?: string;
}
```

### 6.2 UploadedFile

```ts
interface UploadedFile {
  id: string;
  name: string;
  path: string;
  status: "SUCCESS" | string;
  text?: string;
}
```

### 6.3 Clause

```ts
interface Clause {
  clause_id: string;              // 如 c1、c2
  raw_category?: string;          // 核心指标/基础指标/观察项
  business_category?: string;     // 产品开发/平台开发/技术研发/体系建设/人才培养/行业影响
  category: string;               // 报告业务分类，不允许使用核心指标/基础指标/观察项
  title: string;                  // 指标名称
  target_description: string;     // 具体考核基准，禁止“见合同”
  weight?: number;                // 百分比权重
  milestones: Milestone[];
}

interface Milestone {
  date: string;
  content: string;
}
```

### 6.4 Evidence

```ts
interface Evidence {
  evidence_id: string;
  source_file_id?: string;
  source_file_name: string;
  object_type?: string;
  object_id?: string | null;
  title: string;
  raw_excerpt: string;
  summary: string;
  location?: any;
  confidence: number;
  delay_owner?: string | null;
  adopted_flag: boolean;
  duplicate_flag?: boolean;
  cross_domain_flag?: boolean;
  key_issue_found_flag?: boolean;
  close_loop_flag?: boolean;
  matched_clause_id?: string;
}
```

### 6.5 ClauseResult

```ts
interface ClauseResult {
  clause_id: string;
  title: string;
  category: string;
  raw_category?: string;
  business_category?: string;
  weight?: number;
  score: number;                  // 0-120
  target_benchmark: string;
  completion_status: "完成" | "未完成" | "部分完成" | string;
  actual_value: string;
  evidence_summary: string;
  matched_evidence_ids: string[];
  scoring_detail?: ScoringDetail | null;
}
```

### 6.6 ScoringDetail

```ts
interface ScoringDetail {
  source: "rule_engine" | "ai_fallback";
  rule_type: "numeric_positive" | "numeric_negative" | "count" | "percentage" | "milestone" | "ai_fallback";
  target_value: number | null;
  actual_value: number | null;
  rejected_actual_value?: number | null;
  baseline_value?: number | null;
  early_days?: number;
  delayed_days?: number;
  has_challenge?: boolean | null;
  challenge_met?: boolean | null;
  on_time?: boolean | null;
  ai_score: number;
  final_score: number;
  formula: string;
  evidence_files: string[];
  audit_files: FileAuditDebug[];
  inferred_from_target?: boolean;
}
```

### 6.7 ValueCreation

```ts
interface ValueCreation {
  score: number;                  // 0-10
  summary: string;
  details: Record<string, string>;
}
```

### 6.8 CompetencyAnalysis

```ts
interface CompetencyAnalysis {
  fit_score: number;              // 0-8
  fit_eval: string;
  radar_data: Array<{
    subject: string;
    score: number;                // 0-8，1 位小数
    baseline: 5;
    conclusion: string;
    evidence: string;
    logic: string;
  }>;
  strengths: string[];
  weaknesses: string[];
  potential_level: string;
  recommendation: string;
  overview?: {
    fit: string[];
    strengths: string[];
    weaknesses: string[];
    suggestion: string;
  };
}
```

### 6.9 OverallSummary

```ts
interface OverallSummary {
  core_conclusion: string;
  overall_score: number;
  general_eval: string;
  core_strengths: string;
  improvements: string;
  performance_grade: string;
  evaluation_conclusion: string;
  value_creation_details: {
    score: number;
    main_desc: string;
    product_projects: string | null;
    business_revenue: string | null;
    tech_innovation: string | null;
    industry_influence: string | null;
  };
  metrics: {
    task_count: number;
    milestone_count: number;
    milestone_completion_rate: number;
  };
}
```

### 6.10 ManualCalibration

```ts
interface ManualCalibration {
  metric_name: string;
  score: number;
  comment: string;
  reviewer: string;               // 默认 manager_001
  evidence_refs: string[];
}
```

## 7. API 设计

统一响应建议：

```json
{ "code": 200, "data": {}, "message": "" }
```

### 7.1 AI 配置

#### GET `/api/config/ai`

返回当前 AI 配置。

```json
{
  "provider": "local",
  "localUrl": "",
  "localModel": "",
  "localApiKey": ""
}
```

#### POST `/api/config/ai`

保存配置到当前服务进程内存。

请求体同上，返回：

```json
{ "code": 200 }
```

### 7.2 AI 代理

#### POST `/api/v1/ai/call`

请求：

```json
{
  "prompt": "用户提示词",
  "config": {
    "provider": "local",
    "localUrl": "http://127.0.0.1:11434/v1",
    "localModel": "qwen2.5-vl:7b",
    "localApiKey": "optional",
    "temperature": 0.1
  }
}
```

规则：

- 仅支持 `provider=local`。
- `localUrl` 若不是 `/chat/completions` 或 `/completions` 结尾，自动补 `/chat/completions`。
- 请求本地模型时 body：

```json
{
  "model": "config.localModel 或 default",
  "messages": [{ "role": "user", "content": "prompt" }],
  "temperature": 0.1
}
```

返回：

```json
{ "code": 200, "data": "模型返回文本" }
```

### 7.3 快速文件解析

#### POST `/api/v1/files/upload`

- 表单字段：`file`。
- 单文件大小上限：200MB。
- 返回：

```json
{ "code": 200, "data": { "extractedText": "解析后的文本" } }
```

### 7.4 文件暂存

#### POST `/api/v1/evaluation/tasks/stage`

- 表单字段：`task_id` 可选，`files[]` 最多 20 个。
- 逻辑：如果无 `task_id` 则创建新任务，状态 `STAGING`；解析文件文本并追加到 `deliverable_files`。
- 返回：

```json
{ "code": 200, "data": { "task_id": "uuid", "count": 3 } }
```

### 7.5 创建/启动评估任务

#### POST `/api/v1/evaluation/tasks`

表单字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `employee_id` | string | 员工编号 |
| `employee_name` | string | 员工姓名 |
| `job_name` | string | 岗位名称 |
| `start_date` | string | 考核开始 |
| `end_date` | string | 考核结束 |
| `contract_text` | string | 可选合同文本 |
| `task_id` | string | 可选暂存任务 ID |
| `contract` | file | 可选绩效合同文件，最多 1 个 |
| `deliverables` | file[] | 兼容旧流程，最多 100 个 |

返回：

```json
{
  "code": 200,
  "data": {
    "task_id": "TASK_...",
    "contractText": "...",
    "deliverables": [{ "name": "xx.pdf", "text": "..." }]
  }
}
```

### 7.6 任务 Upsert

#### POST `/api/v1/evaluation/tasks/:task_id/upsert`

用于创建或更新任务元数据与计算结果。

请求体可包含：

```json
{
  "employee_id": "E001",
  "employee_name": "张三",
  "job_name": "高级技术架构师",
  "evaluation_period": "2024-01-01 ~ 2024-12-31",
  "assessment_period": { "start": "2024-01-01", "end": "2024-12-31" },
  "clauses": [],
  "results": [],
  "evidences": [],
  "category_stats": [],
  "competency_analysis": {},
  "overall_summary": {},
  "value_creation": {},
  "debug_scoring_details": [],
  "status": "REPORT_READY"
}
```

返回：

```json
{ "code": 200, "message": "Upsert successful", "task_id": "..." }
```

### 7.7 同步增量结果

#### POST `/api/v1/evaluation/tasks/:task_id/sync-results`

请求体：

```json
{
  "clauses": [],
  "evidences": [],
  "results": [],
  "value_creation": {},
  "overall_summary": {},
  "category_stats": [],
  "competency_analysis": {},
  "debug_scoring_details": [],
  "status": "AUDITING",
  "is_append": true
}
```

规则：

- `is_append=true` 时按 `clause_id`/`evidence_id` 去重追加。
- `is_append=false` 时覆盖对应集合。

返回：

```json
{ "code": 200, "message": "Sync successful", "evidence_count": 12, "status": "AUDITING" }
```

### 7.8 查询接口

| 方法 | 路径 | 返回 |
| --- | --- | --- |
| GET | `/api/v1/evaluation/tasks` | 任务列表，不包含 `STAGING` |
| GET | `/api/v1/evaluation/tasks/:task_id/status` | 状态、进度、考核周期、合同文本、交付物文本 |
| GET | `/api/v1/evaluation/tasks/:task_id/evidences` | 证据列表 |
| GET | `/api/v1/evaluation/tasks/:task_id/contract-clauses` | 指标列表 |
| GET | `/api/v1/evaluation/tasks/:task_id/clause-results` | 指标结果、价值创造、总体总结、分类统计、能力分析、调试评分 |
| GET | `/api/v1/evaluation/tasks/:task_id/report` | 报告 |

### 7.9 人工校准与报告生成

#### POST `/api/v1/evaluation/tasks/:task_id/manual-review`

请求：

```json
{
  "items": [
    { "metric_name": "业绩贡献 - 目标达成", "score": 90, "comment": "...", "reviewer": "manager_001", "evidence_refs": [] }
  ]
}
```

响应：

```json
{ "code": 200 }
```

#### POST `/api/v1/evaluation/tasks/:task_id/generate-report`

生成最终报告，返回：

```json
{ "code": 200 }
```

### 7.10 文件下载

#### GET `/api/v1/evaluation/tasks/:task_id/files/download?name=文件名`

- 在任务的 `deliverable_files` 与 `contract_file` 中按文件名精确或模糊匹配。
- 找到后返回文件下载。
- 找不到返回 404 JSON。

## 8. 文件解析要求

### 8.1 支持格式

- PDF：优先 `pdf-parse`；若抽取文本质量差，使用 PDF 转图片 + OCR/VLM。
- 图片：支持 png、jpg、jpeg、webp、bmp、tif、tiff，通过本地 VLM 或 OCR 抽取。
- Word/Office：使用 `officeparser`、`mammoth` 等工具解析。
- Excel：使用 `xlsx` 抽取工作表 CSV 文本。
- 其它文本类文件：尽量按 UTF-8 文本读取。

### 8.2 PDF/VLM 解析

- 本地 VLM 配置来源优先级：环境变量 `LOCAL_VLM_URL` / `VLM_URL` / `QWEN_API_URL`，其次运行时配置 `localUrl`。
- 模型名优先级：`LOCAL_VLM_MODEL` / `VLM_MODEL` / `QWEN_MODEL`，默认 `faw-vlm`。
- API Key 优先级：`LOCAL_VLM_API_KEY` / `VLM_API_KEY` / `QWEN_API_KEY`。
- PDF 使用 `pdftoppm` 转 PNG，默认 180 DPI，最多处理前 8 页。
- 每页先用 `tesseract` 识别 `chi_sim+eng`，再把图片 + OCR 文本发给本地 VLM，要求输出 Markdown。

### 8.3 大文件压缩

- 本地模型模式下，对每个指标的文件文本进行智能压缩，只保留与指标标题、考核基准更相关的片段。
- 文件级审计 prompt 中，文本截断上限：本地模型约 10,000 字符，非本地模型约 12,000 字符。

## 9. AI 提示词与输出约束

### 9.1 合同解析 Prompt

角色：专业 HR 绩效考评解析专家。

输入：绩效合同全文，最多截取 20,000 字符。

强约束：

- 识别每一个“考核指标/重点工作”。
- 合同表格中的“核心指标/基础指标/观察项”属于第一层分类，只能写入 `raw_category`。
- `category` 与 `business_category` 必须是第二层业务分类，优先值：产品开发、平台开发、技术研发、体系建设、人才培养、行业影响。
- `target_description` 必须是具体考核基准，禁止“见合同”。
- 提取关键时间节点到 `milestones`。

输出 JSON 数组：

```json
[
  {
    "clause_id": "c1",
    "raw_category": "核心指标/基础指标/观察项",
    "business_category": "产品开发/平台开发/技术研发/体系建设/人才培养/行业影响",
    "category": "产品开发/平台开发/技术研发/体系建设/人才培养/行业影响",
    "title": "指标原文名称",
    "target_description": "具体的考核基准描述",
    "weight": 20,
    "milestones": [{ "date": "2024-Q1", "content": "完成初步架构设计" }]
  }
]
```

### 9.2 文件级审计 Prompt

角色：资深人才评估审计专家。

输入：待审计指标标题、考核基准、当前交付物文件名、文件文本。

强约束：

1. 若文件原文出现与实际达成相关的数字，原样摘录到 `scoring_facts`。
2. `scoring_facts.value` 必须来自文件原文或 `raw_excerpt`，不允许估算、四舍五入、按目标反推。
3. 文件中无实际达成数字时，`scoring_facts` 返回空数组。

输出 JSON：

```json
{
  "file_name": "文件名",
  "is_meeting_minutes": true,
  "has_substantive_evidence": true,
  "completion_status": "完成/未完成/部分完成",
  "score": 0,
  "summary": "该文件对本指标的判断（30-40字）",
  "scoring_facts": [
    { "value": 10, "unit": "项", "raw_excerpt": "包含该数字的原文片段", "meaning": "该数字代表什么" }
  ],
  "extracted_evidences": [
    { "title": "证据点", "raw_excerpt": "原文", "summary": "说明", "confidence": 0.9 }
  ]
}
```

### 9.3 指标汇总审计 Prompt

角色：人才评估终审专家。

输入：指标、考核基准、文件级审计结果、`hasSubstantiveNonMinutes`。

规则：

1. 仅依据文件级结果。
2. 会议纪要默认通过逻辑仅当存在非纪要实质证据时可作为加分/佐证，不可单独决定完成。
3. 若 `hasSubstantiveNonMinutes=false`，最终不允许给出“完成”。
4. `scoring_fields.rule_type` 按真实口径选择：`percentage`、`count`、`numeric_positive`、`numeric_negative`、`milestone` 或 `ai_fallback`。
5. `actual_value` 只能来自文件级 `scoring_facts.value` 或 `extracted_evidences.raw_excerpt` 原文数字；不能根据目标值、经验或模型常识补写。
6. 只有明确计划节点和实际完成时间，且证据能抽出提前/拖期/按期事实时，才用 `milestone`。
7. `milestone` 尽量给出 `early_days` 或 `delayed_days`；确认为按期时 `early_days=0`、`delayed_days=0`、`on_time=true`。

输出 JSON：

```json
{
  "summary": "30-50字",
  "completion_status": "完成/未完成/部分完成",
  "score": 0,
  "scoring_fields": {
    "rule_type": "numeric_positive/numeric_negative/count/percentage/milestone/ai_fallback",
    "target_value": 100,
    "actual_value": 90,
    "baseline_value": null,
    "has_challenge": null,
    "challenge_met": null,
    "early_days": null,
    "delayed_days": null,
    "on_time": null,
    "use_milestone_rule": false,
    "calculation_note": "字段提取说明"
  },
  "adopted_files": ["文件名"],
  "rejected_files": [{ "file_name": "xx", "reason": "xx" }],
  "extracted_evidences": [
    { "title": "证据点", "raw_excerpt": "原文", "summary": "共同佐证说明", "confidence": 0.9, "source_file_name": "文件名1, 文件名2" }
  ]
}
```

### 9.4 价值创造 Prompt

角色：资深人才价值评估专家。

输入：证据库预览，最多前 50 条。

目标：评估数字化人才在合同职责之外创造的增量价值。

关注点：架构优化能力、团队赋能、流程建设、业务影响力。

输出 JSON：

```json
{
  "score": 0,
  "summary": "基于证据的人才价值点深度总结（30-40字）",
  "details": {
    "亮点1": "具体贡献说明（30-40字）",
    "亮点2": "具体贡献说明（30-40字）"
  }
}
```

### 9.5 能力分析 Prompt

角色：资深组织发展专家。

输入：岗位要求/胜任力模型、简历、实际审计结果。

强制雷达图维度：

1. 培育与协同力；
2. 创新与战略落地力；
3. 产品履约交付力；
4. 技术突破攻坚力。

若从胜任力模型中稳定提取到其它“能力项”列，则逐项追加，不得遗漏、不得改名，不允许新增其它维度名。

评分规则：

- 每个 `radar_data.score` 为 0-8，保留 1 位小数。
- `baseline` 固定 5。
- `fit_score` 同样为 0-8。

输出 JSON：

```json
{
  "fit_score": 0,
  "fit_eval": "岗位适配度定性评价",
  "radar_data": [
    { "subject": "培育与协同力", "score": 6.5, "baseline": 5, "conclusion": "评价结论", "evidence": "支撑业绩标题或行为表现", "logic": "评估逻辑" }
  ],
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["改进1", "改进2"],
  "potential_level": "潜力评级文字",
  "recommendation": "培养建议"
}
```

### 9.6 综合总结 Prompt

输入：真实审计指标结论数据、可引用指标标题池、总分、价值创造结果、能力分析。

强约束：

- `core_strengths`、`improvements` 必须从可引用指标标题池选择项目名称，严禁捏造。
- `general_eval` 需整合任务指标达成与团队培养/能力沉淀。
- `value_creation_details` 四个维度（产品项目、经营收益、技术创新、行业影响）必须对照证据库；缺乏具体证据则返回 `null`。
- 产品项目：审计数据中出现 P 或 E 开头项目号（如 P717、E900）时，归为产品项目，并使用固定话术：“主导完成XX等XX个车型项目，并在项目推进、方案交付与跨部门协同中表现较好”。
- `evaluation_conclusion` 不体现梯队，也不要写“需要培养什么能力”；从业绩成果、能力强项、能力适配等方面总结。

输出 JSON：

```json
{
  "core_conclusion": "一句话核心评估结论",
  "overall_score": 92.5,
  "general_eval": "深度综合评价报告",
  "core_strengths": "2-3个核心优势点",
  "improvements": "2-3个待改进及建议点",
  "performance_grade": "B",
  "evaluation_conclusion": "综合评价结论",
  "value_creation_details": {
    "score": 8,
    "main_desc": "增量价值汇总描述",
    "product_projects": "证据详情或 null",
    "business_revenue": "证据详情或 null",
    "tech_innovation": "证据详情或 null",
    "industry_influence": "证据详情或 null"
  },
  "metrics": {
    "task_count": 5,
    "milestone_count": 10,
    "milestone_completion_rate": 80
  }
}
```

## 10. 评分规则

### 10.1 分数范围

- 单项指标分：0-120，四舍五入取整数并 clamp 到 0-120。
- 目标达成分：按指标权重加权平均/加权求和。
- 价值创造分：0-10。
- 最终总分：`目标达成分 + 价值创造分`，服务端最终报告生成时 capped 到 120；前端综合总结可保留计算值。
- 能力分：0-8。

### 10.2 数字解析

- 从字符串中提取首个数字，支持百分号、中文逗号。
- `无/未知/不适用/N/A` 视为 null。
- 百分号文本中数字小于等于 1 时按比例转为百分数，例如 `0.8%` 的逻辑需谨慎；建议实现时遵循原逻辑：若文本含 `%` 且数字 `<=1`，则乘以 100。

### 10.3 指标类型推断

根据 `scoring_fields.rule_type`、`metric_type` 或目标文本推断：

| 类型 | 触发条件 |
| --- | --- |
| `percentage` | 出现 `%`、百分比、完成率、达成率、覆盖率、占比、比例、准确率、通过率 |
| `count` | 出现“个/项/次/篇/份/套/场/类/人/件/条/本/车型/项目/报告/标准/专利/论文/培训/课程”等数量单位 |
| `numeric_negative` | 出现降低、减少、下降、不高于、低于、小于、以内、控制在、缺陷、投诉、成本、周期、时长、延迟、拖期、风险 |
| `numeric_positive` | 有数字目标但不属于上述类型 |
| `milestone` | 明确计划节点、实际完成时间、提前/拖期/按期事实 |
| `ai_fallback` | 字段不足或证据不支持规则计算 |

### 10.4 实际值证据校验

- `actual_value` 必须能在文件级 `scoring_facts.raw_excerpt` 或 `extracted_evidences.raw_excerpt` 中找到。
- 若 AI 返回的实际值未在证据中命中，则置为 null，并沿用 AI 兜底分。
- 命中方式包括整数、小数、去零小数形式与中文/英文百分号形式。

### 10.5 规则引擎公式

| 类型 | 公式 | 上限/下限 |
| --- | --- | --- |
| `numeric_positive` | `actual / target * 100` | clamp 0-120 |
| `numeric_negative` | `(2 - actual / target) * 100` | clamp 0-120 |
| `count` | `100 + (actual - target) * 2` | clamp 0-120 |
| `percentage` | `actual / target * 100` | clamp 0-120 |
| 普通里程碑按期 | `100` | clamp 0-120 |
| 普通里程碑提前 | `100 + early_days / 60 * 20` | 最高 120 |
| 普通里程碑拖期 | `100 - delayed_days / 30 * 10` | 最低 80 |
| 挑战指标按期达成 | `110` | clamp 0-120 |
| 挑战指标提前达成 | `110 + early_days / 30 * 10` | 最高 120 |
| 挑战指标拖期达成 | `110 - delayed_days / 30 * 10` | 最低 90 |

### 10.6 会议纪要特殊逻辑

- 文件级审计返回 `is_meeting_minutes=true` 时视为会议纪要。
- 若某指标没有任何非纪要实质证据：
  - 汇总结果不得为“完成”；
  - 如会议纪要显示通过/同意推进/验收通过等支持性信息，可将状态置为“部分完成”，分数限定在 80-90，并生成对外友好话术；
  - 若无会议纪要支持，则总结为未发现直接证明达成的非纪要实质证据。
- 若存在非纪要实质证据，会议纪要可作为加分/佐证。

### 10.7 分类统计

对每个结果：

```ts
categoryScores[category] += score * (weight / 100)
categoryWeights[category] += weight
```

分类统计：

```ts
completion_rate = categoryWeights[cat] > 0 ? round(categoryScores[cat] / categoryWeights[cat] * 100) : 0
score = round(categoryScores[cat])
description = 同分类指标标题用“；”连接
```

## 11. 报告生成规则

### 11.1 服务端报告结构

```ts
interface GeneratedReport {
  clauses: Clause[];
  report_json: {
    employee: { name: string; id: string; job: string };
    period: { start: string; end: string };
    overall: {
      summary: string;
      score: string;
      goal_score: number;
      creation_score: number;
      core_strengths: string;
      improvements: string;
      performance_grade: string;
      evaluation_conclusion: string;
      value_creation_details: any;
      metrics: {
        task_count: number;
        milestone_count: number;
        milestone_completion_rate: number;
      };
    };
    value_creation: { score: number; summary: string; details: any };
    clauses: ClauseResult[];
    evidences: Evidence[];
    category_stats: CategoryStat[];
    competency_analysis: CompetencyAnalysis;
    suggestions: string[];
  };
  report_markdown: string;
}
```

### 11.2 人工校准优先级

- 若存在人工校准项名称包含“目标达成”，目标达成分优先使用该校准分。
- 若存在人工校准项名称包含“价值创造”，价值创造分优先使用该校准分。
- 若人工校准评语不是“AI 预置建议分”，报告总体 summary 优先使用该评语。
- 无人工校准时使用 AI/规则计算结果。

### 11.3 等级规则

- 若 `overall_summary.performance_grade` 存在，优先使用。
- 否则：总分 >= 90 为 A；>= 80 为 B；否则 C。
- 前端能力分析中的 `potential_level` 也可作为综合总结 prompt 的 `performance_grade` 输入。

### 11.4 报告话术模板

综合评价模板：

```text
评价期内共设计 {taskCount} 个任务指标，覆盖 {milestoneCount} 项里程碑，完成 {completedCount} 项，其中按期完成 {onTimeCount} 项，提前完成 {earlyCount} 项，拖期完成 {delayedCount} 项，整体评分 {overallScore} 分，绩效等级 {performanceGrade}；培养团队成员 {teamCount} 人，开展 {trainingTopics} 等专业培训，提升团队成员 {capabilities} 等能力，能力有效沉淀
```

核心优势模板：

```text
能够主导完成 {majorTasks} 重难点任务，工作成果可量化、可落地，在 {excellenceAreas} 方面表现出色，能够高效完成本职工作及交办专项任务，业绩产出稳定可控
```

待改进模板：

```text
在 {projectTask} 工作产出了 {actualResults} 成果，距离目标仍有一定差距，且实施过程存在 {issues} 等情况，建议加强 {suggestions}
```

## 12. 前端实现建议

### 12.1 技术栈

- React 19 + TypeScript。
- Vite 6。
- Tailwind CSS 4。
- 图标：lucide-react。
- 动画：motion/react。
- 图表：recharts。
- 样式工具：clsx + tailwind-merge。

### 12.2 状态设计

核心前端 state：

```ts
currentTaskId: string | null;
taskStatus: any;
assessmentPeriod: { start: string; end: string };
metricFiles: Record<string, any[]>;
activeStep: "create" | "evidence" | "status" | "calibration" | "report" | "history";
evidences: any[];
clauses: any[];
results: any[];
valueCreation: any;
overallSummary: any;
categoryStats: any[];
competencyAnalysis: any;
activeReportTab: "overview" | "details" | "competency";
report: any;
showSettings: boolean;
aiConfig: any;
manualContractText: string;
capabilityText: string;
resumeText: string;
contractPreview: { name: string; text: string } | null;
taskHistory: any[];
```

### 12.3 本地存储

- `localStorage.talent_task_id` 保存当前任务 ID。
- `localStorage.talent_active_step` 保存当前步骤。

### 12.4 JSON 解析

需要实现鲁棒 `extractJSON(text)`：

- 去除 Markdown code fence。
- 优先整体 `JSON.parse`。
- 失败后在文本中搜索第一个合法数组或对象片段解析。
- 解析失败输出日志并返回 null/空。

## 13. 后端实现建议

### 13.1 技术栈

- Node.js ESM。
- Express 4。
- Vite middleware 开发模式；生产模式托管 `dist`。
- multer 文件上传，磁盘保存到 `uploads/`。
- uuid 生成 ID。
- pdf-parse、officeparser、mammoth、xlsx、tesseract、pdftoppm 支持文件解析。

### 13.2 服务端内存存储

```ts
const tasks: Record<string, EvaluationTask> = {};
let aiConfig = { provider: "local", localUrl: "", localModel: "", localApiKey: "" };
```

### 13.3 启动

- 默认端口：3000。
- 监听地址：`0.0.0.0`。
- 开发：`npm run dev`，即 `tsx server.ts`。
- 构建：`npm run build`。
- 类型检查：`npm run lint`，即 `tsc --noEmit`。

## 14. 运行与环境

### 14.1 安装与启动

```bash
npm install
npm run setup:ocr-deps
npm run check:ocr-deps
npm run dev
```

### 14.2 本地 VLM/OCR 环境变量

```bash
export LOCAL_VLM_URL=http://127.0.0.1:11434/v1
export LOCAL_VLM_MODEL=qwen2.5-vl:7b
export LOCAL_VLM_API_KEY=your_key_if_needed
```

兼容变量：

- URL：`LOCAL_VLM_URL`、`VLM_URL`、`QWEN_API_URL`。
- Model：`LOCAL_VLM_MODEL`、`VLM_MODEL`、`QWEN_MODEL`。
- API Key：`LOCAL_VLM_API_KEY`、`VLM_API_KEY`、`QWEN_API_KEY`。

## 15. 测试验收标准

### 15.1 合同解析验收

- 给定含多项指标的合同文本，系统能解析出非空 `clauses`。
- `category` 不应为“核心指标/基础指标/观察项”。
- 每个指标必须有 `title` 和具体 `target_description`。
- 权重能正确读取；读取不到时可为空或默认。

### 15.2 证据审计验收

- 未上传交付物的指标结果为未完成、0 分。
- 上传无关文件时，不应误判完成。
- 上传含实际达成数字的文件时，`scoring_facts` 必须包含原文摘录。
- AI 返回的 `actual_value` 若无法在证据原文命中，不能用于规则复算。
- 只有会议纪要且无非纪要实质证据时，不应输出“完成”。

### 15.3 评分验收

- 正向数值：实际 80、目标 100，应为 80 分。
- 百分比：实际 90、目标 100，应为 90 分。
- 数量：实际 12、目标 10，应为 104 分。
- 负向数值：实际 8、目标 10，应为 120 分前公式值，最终 clamp 120。
- 普通里程碑提前 30 天，应为 110 分。
- 普通里程碑拖期 30 天，应为 90 分。
- 挑战指标按期达成应为 110 分。

### 15.4 报告验收

- 报告必须包含员工信息、考核周期、总分、等级、目标达成分、价值创造分。
- 报告必须包含指标明细与证据溯源。
- 能力分析必须至少包含 4 个核心雷达图维度。
- 人工校准后报告分数应使用校准分。

### 15.5 API 验收

- 所有 API 错误都返回 JSON，不返回 HTML。
- 文件过大返回 413 相关提示。
- `/api/v1/ai/call` 对本地模型地址自动补全 `/chat/completions`。
- 历史任务接口不返回 `STAGING` 任务。

## 16. 复刻系统时的关键一致性清单

若让大模型基于本文档重新开发，请务必保证以下一致：

1. 采用“先合同解析、再分指标上传证据、再逐指标审计”的流程。
2. `category` 使用业务分类，不使用“核心指标/基础指标/观察项”。
3. 文件级审计与指标汇总审计分两层 AI 调用。
4. 会议纪要不能单独决定完成。
5. 实际值必须来源于证据原文，不能按目标反推。
6. 分数必须支持 0-120，且包含规则引擎复算。
7. 价值创造是独立 0-10 分专项。
8. 能力分析雷达图必须包含四个核心维度。
9. 报告分为概览、指标明细、能力明细。
10. 服务端 AI 代理只支持本地 OpenAI 兼容接口。
11. 当前交付版可使用内存存储，不强制数据库。
12. API 路径、请求/响应结构尽量按本文档实现，便于前端和后端兼容。
