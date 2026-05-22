# AI 绩效考评系统 (交付版)

## 1. 研发启动
```bash
npm install
npm run dev
```

## 2. 核心逻辑流
1. **上传合同**: `src/App.tsx` 调用 AI 提取指标（Clauses）。
2. **上传交付物**: `src/App.tsx` 调用 AI 生成证据摘要（Evidences）。
3. **二轮考评**: 后端 `server.ts` 结合指标与证据，调用 AI 生成深度评估。
4. **生成报告**: 输出包含半年/全年目标对比、三维评分、证据溯源的 JSON。

## 3. 环境变量
请在根目录创建 `.env` 文件并填入：
`GEMINI_API_KEY=YOUR_KEY`

## 4. 数据一致性
所有数据交换必须符合 `src/types/schema.ts` 定义。
