import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractFileText } from '../../server.ts';

const ENABLE_VLM_E2E = process.env.ENABLE_VLM_E2E === '1';
const LOCAL_VLM_URL = process.env.LOCAL_VLM_URL || '';
const LOCAL_VLM_MODEL = process.env.LOCAL_VLM_MODEL || 'default';
const LOCAL_VLM_API_KEY = process.env.LOCAL_VLM_API_KEY || '';

function normalizeChatCompletionsUrl(baseUrl) {
  if (!baseUrl) return '';
  if (baseUrl.endsWith('/chat/completions') || baseUrl.endsWith('/completions')) return baseUrl;
  return `${baseUrl.replace(/\/$/, '')}/chat/completions`;
}

async function runLocalVlmCheck(extractedText) {
  const targetUrl = normalizeChatCompletionsUrl(LOCAL_VLM_URL);
  assert.ok(targetUrl, 'ENABLE_VLM_E2E=1 时必须提供 LOCAL_VLM_URL');

  const prompt = `你是PDF解析质量检查器。请判断这段抽取文本是否可用于后续VLM推理，并给一句简短结论：\n\n${extractedText.slice(0, 2000)}`;
  const body = {
    model: LOCAL_VLM_MODEL,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }]
  };

  const resp = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(LOCAL_VLM_API_KEY ? { Authorization: `Bearer ${LOCAL_VLM_API_KEY}` } : {})
    },
    body: JSON.stringify(body)
  });

  assert.equal(resp.ok, true, `本地VLM接口调用失败: HTTP ${resp.status}`);
  const json = await resp.json();
  const answer = json?.choices?.[0]?.message?.content || json?.choices?.[0]?.text || '';
  assert.ok(String(answer).trim().length > 0, '本地VLM未返回有效内容');
}

test('PDF 解析结果可直接用于 VLM 下游提示词', async () => {
  const samplePdfPath = join(tmpdir(), `pdf-parse-test-${Date.now()}.pdf`);
  const samplePdf = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n5 0 obj\n<< /Length 55 >>\nstream\nBT\n/F1 24 Tf\n72 720 Td\n(Hello PDF VLM Parse) Tj\nET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n0000000243 00000 n \n0000000313 00000 n \ntrailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n418\n%%EOF`;
  writeFileSync(samplePdfPath, samplePdf, 'binary');

  try {
    const extracted = await extractFileText(samplePdfPath, 'sample.pdf');
    assert.ok(extracted.length > 0, 'PDF 未抽取到文本');

    const badCharRatio = (extracted.match(/[\u0000-\u001F\uFFFD]/g) || []).length / Math.max(1, extracted.length);
    assert.ok(badCharRatio < 0.03, `抽取文本疑似乱码，bad ratio=${badCharRatio}`);

    if (ENABLE_VLM_E2E) {
      await runLocalVlmCheck(extracted);
    }
  } finally {
    rmSync(samplePdfPath, { force: true });
  }
});
