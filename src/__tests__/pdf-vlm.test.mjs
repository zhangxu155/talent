import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractFileText } from '../../server.ts';

test('PDF 解析结果可直接用于 VLM 下游提示词', async () => {
  const samplePdfPath = join(tmpdir(), `pdf-parse-test-${Date.now()}.pdf`);
  const samplePdf = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n5 0 obj\n<< /Length 55 >>\nstream\nBT\n/F1 24 Tf\n72 720 Td\n(Hello PDF VLM Parse) Tj\nET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n0000000243 00000 n \n0000000313 00000 n \ntrailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n418\n%%EOF`;
  writeFileSync(samplePdfPath, samplePdf, 'binary');

  try {
    const extracted = await extractFileText(samplePdfPath, 'sample.pdf');
    assert.ok(extracted.length > 0, 'PDF 未抽取到文本');

    const badCharRatio = (extracted.match(/[\u0000-\u001F\uFFFD]/g) || []).length / Math.max(1, extracted.length);
    assert.ok(badCharRatio < 0.03, `抽取文本疑似乱码，bad ratio=${badCharRatio}`);
  } finally {
    rmSync(samplePdfPath, { force: true });
  }
});
