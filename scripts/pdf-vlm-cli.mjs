#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { extractFileText } from '../server.ts';

function normalizeChatCompletionsUrl(baseUrl) {
  if (!baseUrl) return '';
  if (baseUrl.endsWith('/chat/completions') || baseUrl.endsWith('/completions')) return baseUrl;
  return `${baseUrl.replace(/\/$/, '')}/chat/completions`;
}

async function summarizeWithLocalModel(text) {
  const baseUrl = process.env.LOCAL_VLM_URL || '';
  const model = process.env.LOCAL_VLM_MODEL || 'default';
  const apiKey = process.env.LOCAL_VLM_API_KEY || '';
  const targetUrl = normalizeChatCompletionsUrl(baseUrl);

  if (!targetUrl) return '未配置 LOCAL_VLM_URL，跳过模型总结。';

  const prompt = `请基于以下PDF解析文本，输出简要总结（3-5条要点）并标注潜在风险点：\n\n${text.slice(0, 8000)}`;
  const resp = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) throw new Error(`本地模型调用失败: HTTP ${resp.status}`);

  const json = await resp.json();
  return json?.choices?.[0]?.message?.content || json?.choices?.[0]?.text || '模型未返回内容';
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('用法: npm run pdf:cli -- /path/to/file.pdf');
    process.exit(1);
  }

  const resolved = path.resolve(process.cwd(), inputPath);
  if (!existsSync(resolved)) {
    console.error(`文件不存在: ${resolved}`);
    process.exit(1);
  }

  const ext = path.extname(resolved).toLowerCase();
  if (ext !== '.pdf') {
    console.error(`仅支持 PDF 文件，当前扩展名: ${ext || '(none)'}`);
    process.exit(1);
  }

  readFileSync(resolved);

  const extracted = await extractFileText(resolved, path.basename(resolved));
  console.log('\n===== PDF解析输出（前2000字符）=====\n');
  console.log((extracted || '').slice(0, 2000) || '[空文本]');
  console.log('\n===== PDF解析输出长度 =====');
  console.log(extracted.length);

  const summary = await summarizeWithLocalModel(extracted || '');
  console.log('\n===== 模型总结 =====\n');
  console.log(summary);
}

main().catch((err) => {
  console.error('执行失败:', err?.message || err);
  process.exit(1);
});
