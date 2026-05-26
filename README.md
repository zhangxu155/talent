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
本地部署模式无需 Gemini Key。

## 4. 数据一致性
所有数据交换必须符合 `src/types/schema.ts` 定义。


## 5. 仅测试 PDF 解析（可选串接本地 VLM）
```bash
# 仅验证 PDF 抽取是否成功
npm run test:pdf

# 串接本地 OpenAI 兼容接口做端到端验证
ENABLE_VLM_E2E=1 \
LOCAL_VLM_URL=http://127.0.0.1:11434/v1/chat/completions \
LOCAL_VLM_MODEL=qwen2.5-vl:7b \
LOCAL_VLM_API_KEY=your_key_if_needed \
npm run test:pdf
```
说明：
- `LOCAL_VLM_URL` 支持填基础地址（如 `http://127.0.0.1:11434/v1`），脚本会自动补 `/chat/completions`。
- 若本地模型无需鉴权，可不传 `LOCAL_VLM_API_KEY`。


## 6. 手动上传本地 PDF 并让模型总结
```bash
# 1) 配置本地模型接口（OpenAI兼容）
export LOCAL_VLM_URL=http://127.0.0.1:11434/v1
export LOCAL_VLM_MODEL=qwen2.5-vl:7b
# export LOCAL_VLM_API_KEY=your_key_if_needed

# 2) 运行脚本（把你的 PDF 路径传进去）
npm run pdf:cli -- ./your-file.pdf
```
脚本会：
- 读取你传入的 PDF；
- 打印 PDF 解析结果（前 2000 字）和总长度；
- 调用本地模型输出 3-5 条总结与风险点。
