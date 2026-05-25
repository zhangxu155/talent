import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");
const officeParser = require("officeparser");
const { createWorker } = require("tesseract.js");
import mammoth from "mammoth";
import cors from "cors";
import { Decimal } from "decimal.js";
import { GoogleGenAI } from "@google/genai";
const XLSX = require("xlsx");

// --- Types ---
interface Evidence {
  evidence_id: string;
  source_file_id: string;
  source_file_name: string;
  object_type: string;
  object_id: string | null;
  title: string;
  raw_excerpt: string;
  summary: string;
  location: any;
  confidence: number;
  delay_owner: string | null;
  adopted_flag: boolean;
  duplicate_flag: boolean;
  cross_domain_flag: boolean;
  key_issue_found_flag: boolean;
  close_loop_flag: boolean;
}

interface Milestone {
  date: string;
  content: string;
}

interface Clause {
  clause_id: string;
  category: string;
  title: string;
  weight?: number;
  target_description?: string;
  milestones: Milestone[];
}

interface EvaluationTask {
  task_id: string;
  status: string;
  progress: number;
  employee_id: string;
  employee_name: string;
  job_name: string;
  assessment_period: { start: string; end: string };
  deliverable_files: { id: string; name: string; path: string; status: string; text?: string }[];
  contract_file?: { id: string; name: string; path: string; status: string; text?: string };
  evidences: Evidence[];
  clauses: Clause[];
  clause_results: any[];
  value_creation?: any;
  manual_calibrations: any[];
  report?: any;
  overall_summary?: any;
  category_stats?: any[];
  competency_analysis?: any;
  created_at?: string;
}

// --- In-memory Storage ---
const tasks: Record<string, EvaluationTask> = {};

// --- AI Service ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY is not set in environment variables. Please check Settings > Secrets.");
}

const ai = new GoogleGenAI({ 
  apiKey: GEMINI_API_KEY || "missing-key",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// --- Helpers ---

async function extractImageTextWithOCR(filePath: string): Promise<string> {
  let worker: any = null;
  try {
    worker = await createWorker("chi_sim+eng", 1, {
      workerPath: require.resolve("tesseract.js/src/worker-script/node/index.js")
    });
    await worker.setParameters({ tessedit_pageseg_mode: "6" });
    const result = await worker.recognize(filePath);
    return result?.data?.text?.trim?.() || "";
  } catch (err: any) {
    console.warn("Image OCR failed:", err.message);
    return "";
  } finally {
    if (worker) await worker.terminate();
  }
}

async function parseOfficeToText(filePath: string, options: any = {}): Promise<string> {
  try {
    const ast = await officeParser.parseOffice(filePath, options);
    if (ast && typeof ast.toText === "function") {
      return String(ast.toText() || "").trim();
    }
    if (typeof ast === "string") return ast.trim();
    if (ast && typeof ast === "object") {
      return String((ast as any).text || "").trim();
    }
    return "";
  } catch (err: any) {
    console.warn("officeParser parse failed:", err.message);
    return "";
  }
}

function looksLikeBinaryOrBase64Blob(text: string): boolean {
  if (!text) return false;
  const compact = text.replace(/\s+/g, "");
  // Very long base64-like stream
  if (compact.length > 500 && /^[A-Za-z0-9+/=]+$/.test(compact)) return true;
  // Too many replacement/unprintable chars
  const badChars = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/g) || []).length;
  return badChars / Math.max(text.length, 1) > 0.02;
}

async function extractFileText(filePath: string, fileName: string): Promise<string> {
  const ext = path.extname(fileName).toLowerCase();
  const buffer = fs.readFileSync(filePath);
  
  try {
    let extracted = "";
    if (ext === ".pdf") {
      // Robust PDF parser resolution based on logged keys
      let pdfParser = pdf;
      
      // Based on previous logs, the module object might contain a 'PDFParse' function
      // or it might be exported as 'default'
      if (pdfParser && typeof pdfParser === "object") {
        const anyPdf = pdfParser as any;
        if (typeof anyPdf.PDFParse === "function") {
          pdfParser = anyPdf.PDFParse;
        } else if (typeof anyPdf.default === "function") {
          pdfParser = anyPdf.default;
        } else if (typeof anyPdf === "function") {
           // It's already a function
        } else {
          // Robust search for any key that looks like a parser function
          const keys = Object.keys(anyPdf);
          const funcKey = keys.find(k => {
            return typeof anyPdf[k] === "function" && 
                   (k.toLowerCase().includes("parse") || k === "default" || k === "PDFParse");
          });
          if (funcKey) {
            pdfParser = anyPdf[funcKey];
          }
        }
      }

      // If it's still not a function, then use fallback or throw
      if (typeof pdfParser !== "function") {
        const errorMsg = `PDF parser not initialized. Type: ${typeof pdfParser}. Available keys: ${Object.keys(pdf || {}).join(", ")}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Handle "Class constructors cannot be invoked without 'new'"
      let data;
      try {
        if (typeof pdfParser === 'function') {
          // Try calling it as a standard function first
          try {
            data = await (pdfParser as any)(buffer);
          } catch (fnErr: any) {
            if (fnErr.message?.includes("Class constructors cannot be invoked without 'new'")) {
              console.log("PDF parser is a class, instantiating with 'new'");
              data = await new (pdfParser as any)(buffer);
            } else {
              throw fnErr;
            }
          }
        } else {
          // If logic above failed to find a function, we already handled it with an error throw
          throw new Error("PDF parser logic reached invalid state");
        }
      } catch (err: any) {
        console.warn("Standard PDF parser failed, attempting fallback to officeparser", err.message);
        const fallbackText = await parseOfficeToText(filePath);
        data = { text: fallbackText };
      }

      if (typeof data === "string") {
        extracted = data;
      } else if (data && typeof data === "object") {
        // Handle various library return formats
        extracted = (data as any).text || (data as any).data || (data as any).content || "";
        // Don't stringify unknown parser objects into binary/base64 noise.
        if (!extracted) extracted = "";
      } else {
        extracted = String(data || "");
      }
    } else if (ext === ".xlsx" || ext === ".xls") {
      const workbook = XLSX.read(buffer);
      let fullText = "";
      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        // Use CSV format as it preserves simple structure which is good for LLMs
        const csv = XLSX.utils.sheet_to_csv(sheet);
        if (csv.trim()) {
          fullText += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
        }
      });
      extracted = fullText;
    } else if (ext === ".docx") {
      const data = await mammoth.extractRawText({ buffer });
      extracted = data.value || "";
    } else if (ext === ".doc" || ext === ".pptx" || ext === ".ppt") {
      extracted = await new Promise((resolve) => {
        officeParser.parseOffice(filePath, (data: any, err: any) => {
          if (err || !data) {
            console.warn(`OfficeParser failed for ${fileName}:`, err);
            resolve("");
          } else {
            resolve(data);
          }
        });
      });
    } else if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp" || ext === ".bmp" || ext === ".tif" || ext === ".tiff") {
      extracted = await extractImageTextWithOCR(filePath);
    } else if (ext === ".txt" || ext === ".md" || ext === ".json" || ext === ".csv") {
      extracted = buffer.toString("utf-8");
    }

    const trimmed = (typeof extracted === 'string' ? extracted : String(extracted || "")).trim();
    const normalized = looksLikeBinaryOrBase64Blob(trimmed) ? "" : trimmed;
    if (normalized.length < 10 && buffer.length > 1000) {
      if (ext === ".pdf") {
        // For scanned PDFs, enforce OCR via officeParser's OCR pipeline.
        const ocrText = await parseOfficeToText(filePath, {
          ocr: true,
          ocrConfig: {
            language: "chi_sim+eng",
            autoTerminateTimeout: 3000
          }
        });
        if (ocrText && ocrText.length >= 10) return ocrText;
        return `[此 PDF 文件可能是扫描件或图片格式，文本层不可用。系统已尝试 JS 侧解析/OCR回退但仍未获得有效文本，建议先转为PNG后上传或提高扫描质量]`;
      }
      if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp" || ext === ".bmp" || ext === ".tif" || ext === ".tiff") {
        return `[图片文件 OCR 结果过少: ${fileName}。请提高分辨率/对比度，或检查 tesseract.js 语言数据加载是否正常]`;
      }
      return `[解析内容过空: ${fileName} - 无法提取有效文本]`;
    }
    return normalized || `[文件内容为空: ${fileName}]`;
  } catch (err: any) {
    console.error(`Serious error parsing ${fileName}:`, err);
    return `[解析出错: ${fileName} - ${err.message}]`;
  }
}

// --- Constants ---
const EVALUATION_TEMPLATES = {
  OVERALL: "评价期内共设计 {taskCount} 个任务指标，覆盖 {milestoneCount} 项里程碑，完成 {completedCount} 项，其中按期完成 {onTimeCount} 项，提前完成 {earlyCount} 项，拖期完成 {delayedCount} 项，整体评分 {overallScore} 分，绩效等级 {performanceGrade}；培养团队成员 {teamCount} 人，开展 {trainingTopics} 等专业培训，提升团队成员 {capabilities} 等能力，能力有效沉淀",
  STRENGTHS: "能够主导完成 {majorTasks} 重难点任务，工作成果可量化、可落地，在 {excellenceAreas} 方面表现出色，能够高效完成本职工作及交办专项任务，业绩产出稳定可控",
  IMPROVEMENTS: "在 {projectTask} 工作产出了 {actualResults}成果，距离目标仍有一定差距，且实施过程存在 {issues} 等情况，建议加强 {suggestions}"
};

function generateTaskReport(taskId: string) {
  const task = tasks[taskId];
  if (!task) return;

  const cals = task.manual_calibrations || [];
  const aiResults = task.clause_results || [];

  const getDimValue = (dimKey: string, fallback: number) => {
    // 1. Check manual calibration first
    const matches = cals.filter(c => c.metric_name?.includes(dimKey));
    if (matches.length > 0) {
      // Use the latest calibration if multiples exist for some reason
      return Number(matches[matches.length - 1].score) || 0;
    }

    // 2. Fallback to AI results
    if (dimKey === "目标达成") {
      const allClauses = task.clauses || [];
      if (allClauses.length > 0) {
        let totalWeightedScore = 0;
        let totalWeight = 0;
        
        allClauses.forEach(clause => {
          const weight = Number(clause.weight) || 0;
          const result = aiResults.find(r => r.clause_id === clause.clause_id);
          const score = Number(result?.score) || 0;
          totalWeightedScore += (score * weight);
          totalWeight += weight;
        });

        if (totalWeight > 0) return totalWeightedScore / totalWeight;
        const totalScore = allClauses.reduce((acc, clause) => {
          const result = aiResults.find(r => r.clause_id === clause.clause_id);
          return acc + (Number(result?.score) || 0);
        }, 0);
        return totalScore / allClauses.length;
      }
    } else if (dimKey === "价值创造") {
      if (task.value_creation?.total_score !== undefined) return Number(task.value_creation.total_score);
      if (task.value_creation?.score !== undefined) return Number(task.value_creation.score);
    }

    return fallback;
  };

  const goalScore = Number(getDimValue("目标达成", 0).toFixed(1));
  const creationScore = Number(getDimValue("价值创造", 0).toFixed(1));
  const combinedTotal = Math.min(120, Number(goalScore) + Number(creationScore));

  const manualValueNote = cals.find(c => c.metric_name?.includes("价值创造"))?.comment;
  const manualGoalNote = cals.find(c => c.metric_name?.includes("目标达成"))?.comment;

  const totalMilestones = (task.clauses || []).reduce((acc, c) => acc + (c.milestones?.length || 0), 0);
  const completedClausesCount = aiResults.filter(r => r.score >= 60).length;
  
  // Calculate completion stats for the template
  const onTimeCount = aiResults.filter(r => r.completion_status?.includes("按期") || r.completion_status?.includes("正常")).length;
  const earlyCount = aiResults.filter(r => r.completion_status?.includes("提前")).length;
  const delayedCount = aiResults.filter(r => r.completion_status?.includes("拖期") || r.completion_status?.includes("延期")).length;

  // Formatting strings
  const overallSummary = EVALUATION_TEMPLATES.OVERALL
    .replace("{taskCount}", String(task.clauses?.length || 0))
    .replace("{milestoneCount}", String(totalMilestones))
    .replace("{completedCount}", String(completedClausesCount))
    .replace("{onTimeCount}", String(onTimeCount))
    .replace("{earlyCount}", String(earlyCount))
    .replace("{delayedCount}", String(delayedCount))
    .replace("{overallScore}", combinedTotal.toFixed(1))
    .replace("{performanceGrade}", task.overall_summary?.performance_grade || (combinedTotal >= 90 ? "A" : combinedTotal >= 80 ? "B" : "C"))
    .replace("{teamCount}", String(task.overall_summary?.team_count || "0"))
    .replace("{trainingTopics}", task.overall_summary?.training_topics || "相关项目应用方法、核心仿真模型")
    .replace("{capabilities}", task.overall_summary?.capability_improvements || "绩效评价、产品履约交付");

  const coreStrengths = task.overall_summary?.core_strengths || EVALUATION_TEMPLATES.STRENGTHS
    .replace("{majorTasks}", "关键业务攻坚")
    .replace("{excellenceAreas}", "业绩产出与交付");

  const improvements = task.overall_summary?.improvements || EVALUATION_TEMPLATES.IMPROVEMENTS
    .replace("{projectTask}", "日常业务支撑")
    .replace("{actualResults}", "部分阶段性")
    .replace("{issues}", "细节把控不足")
    .replace("{suggestions}", "统筹规划与系统思维");

  const report = {
    clauses: task.clauses || [],
    report_json: {
      employee: { name: task.employee_name || "员工", id: task.employee_id || "-", job: task.job_name || "-" },
      period: task.assessment_period,
      overall: {
        summary: (manualGoalNote && manualGoalNote !== "AI 预置建议分") 
          ? manualGoalNote 
          : (task.overall_summary?.general_eval || overallSummary),
        score: combinedTotal.toFixed(1),
        goal_score: goalScore,
        creation_score: creationScore,
        core_strengths: coreStrengths,
        improvements: improvements,
        performance_grade: task.overall_summary?.performance_grade || (combinedTotal >= 90 ? "A" : combinedTotal >= 80 ? "B" : "C"),
        evaluation_conclusion: task.overall_summary?.evaluation_conclusion || "",
        value_creation_details: task.overall_summary?.value_creation_details || task.value_creation || {},
        metrics: {
          task_count: task.clauses?.length || aiResults.length,
          milestone_count: totalMilestones,
          milestone_completion_rate: totalMilestones > 0 
            ? Math.round((completedClausesCount / Math.max(1, task.clauses?.length || 1)) * 100) 
            : Math.round((completedClausesCount / Math.max(1, aiResults.length)) * 100)
        }
      },
      value_creation: {
        score: creationScore,
        summary: manualValueNote || task.value_creation?.summary || "暂无价值创造汇总评价",
        details: task.value_creation?.details || {}
      },
      clauses: aiResults.map(r => {
        const original = (task.clauses || []).find(c => c.clause_id === r.clause_id);
        return {
          ...r,
          title: original?.title || r.title || "评估项",
          category: original?.category || r.category || "业务指标",
          weight: original?.weight || r.weight || 0,
          target_benchmark: original?.target_description || r.target_value || "-"
        };
      }),
      category_stats: task.category_stats || [],
      competency_analysis: task.competency_analysis || null,
      suggestions: [
        goalScore < 100 ? "建议加强目标达成的里程碑管理，提升项目交付的确定性。" : "目标达成表现优异，建议在更大业务全局中发挥影响力。",
        creationScore < 8 ? "建议在技术突破或行业影响力方面进一步发力，挖掘更多核心价值点。" : "价值创造表现突出，具有较强的行业及技术带动力。",
        "建议参与更多关键业务攻坚，持续总结沉淀核心技术能力与方法论。"
      ]
    }
  };
  const markdown = `# 人才评估报告 - ${task.employee_name || '员工'}
## 基本信息
- **姓名**: ${task.employee_name || '-'}
- **工号**: ${task.employee_id || '-'}
- **岗位**: ${task.job_name || '-'}
- **评估周期**: ${task.assessment_period?.start || '-'} 至 ${task.assessment_period?.end || '-'}

## 综合评估结果
**最终得分: ${combinedTotal.toFixed(0)} 分**

${report.report_json.overall.summary}

---

## 1. 目标达成情况 (权重分: ${goalScore} 分)
${(task.clause_results || []).map((r, i) => {
  const original = (task.clauses || []).find(c => c.clause_id === r.clause_id);
  return `### 【${r.category || '指标'}】${r.title}
- **权重**: ${r.weight}%
- **目标值**: ${r.target_value || '-'}
- **实际达成**: ${r.actual_value || '-'}
- **完成状态**: ${r.completion_status || '-'}
- **单项评分**: ${r.score} 分
- **审计结论**: ${r.evidence_summary || '-'}
`;
}).join('\n')}

## 2. 价值创造专项 (专项加分: ${creationScore} 分)
${report.report_json.value_creation.summary}

## 3. 改进建议
${report.report_json.suggestions.map(s => `- ${s}`).join('\n')}

---
*报告生成时间: ${new Date().toLocaleString()}*
*审计引擎: 人才评估智能系统 (基于 Gemini Pro 1.5)*
`;

  task.report = {
    ...report,
    report_markdown: markdown
  };
}

// --- Server Implementation ---
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '500mb' }));
  app.use(express.urlencoded({ extended: true, limit: '500mb' }));

  // AI Config storage
  let aiConfig = { 
  provider: 'gemini',
  localUrl: '',
  localModel: '',
  localApiKey: ''
};
  const uploadDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  
  // Storage for uploaded files that preserves extensions for officeParser
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  });

  const upload = multer({ 
    storage: storage,
    limits: { 
      fileSize: 200 * 1024 * 1024, // 200MB max per file
      fieldSize: 100 * 1024 * 1024  // 100MB max for text fields
    }
  });

  // NEW: Staging API for incremental uploads
  app.post("/api/v1/evaluation/tasks/stage", upload.array("files", 20), async (req: any, res) => {
    console.log(`Staging request received. Task ID: ${req.body.task_id || 'new'}. Files: ${req.files?.length || 0}`);
    try {
      const { task_id } = req.body;
      const id = task_id || uuidv4();
      
      if (!tasks[id]) {
        console.log(`Creating new task for staging: ${id}`);
        tasks[id] = {
          task_id: id,
          status: "STAGING",
          progress: 0,
          created_at: new Date().toISOString(),
          employee_id: "",
          employee_name: "",
          job_name: "",
          assessment_period: { start: "", end: "" },
          deliverable_files: [],
          evidences: [],
          clauses: [],
          clause_results: [],
          manual_calibrations: []
        };
      }

      const newFiles = (req.files || []).map((f: any) => {
        try {
          f.originalname = Buffer.from(f.originalname, 'latin1').toString('utf8');
        } catch(e) {}
        return f;
      });

      for (const f of newFiles) {
        console.log(`Extracting text from: ${f.originalname} (${f.size} bytes)`);
        const text = await extractFileText(f.path, f.originalname);
        tasks[id].deliverable_files.push({
          id: uuidv4(),
          name: f.originalname,
          path: f.path,
          status: "SUCCESS",
          text
        });
      }

      console.log(`Staging complete for task ${id}. Total deliverables: ${tasks[id].deliverable_files.length}`);
      res.json({ code: 200, data: { task_id: id, count: tasks[id].deliverable_files.length } });
    } catch (e: any) {
      console.error("Staging error:", e);
      res.status(500).json({ code: 500, message: e.message || "文件暂存过程发生服务端错误" });
    }
  });

  // NEW: Get all tasks list
  app.get("/api/v1/evaluation/tasks", (req, res) => {
    const list = Object.values(tasks)
      .filter(t => t.status !== "STAGING") // Only show completed or processing tasks
      .map(t => ({
        task_id: t.task_id,
        status: t.status,
        created_at: t.created_at || new Date().toISOString(),
        employee_name: t.employee_name,
        job_name: t.job_name,
        assessment_period: t.assessment_period,
        final_score: t.overall_summary?.overall_score || 0,
        performance_grade: t.overall_summary?.performance_grade || "N/A"
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    res.json({ code: 200, data: list });
  });

  // 1. Finalize and Start Task (modified to handle both staging and legacy)
  app.post("/api/v1/evaluation/tasks", (req: any, res, next) => {
    upload.fields([
      { name: "deliverables", maxCount: 100 },
      { name: "contract", maxCount: 1 }
    ])(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ code: 413, message: "单个文件超过 100MB 限制。请压缩后再试。" });
        }
        return res.status(400).json({ code: 400, message: `上传错误: ${err.message}` });
      } else if (err) {
        return res.status(500).json({ code: 500, message: "文件上传失败" });
      }
      next();
    });
  }, async (req: any, res) => {
    try {
      const { employee_id, employee_name, job_name, start_date, end_date, contract_text, task_id: staged_id } = req.body;
      const task_id = staged_id || uuidv4();
      
      let contractText = contract_text || "";
      if (req.files?.contract?.[0]) {
        const f = req.files.contract[0];
        f.originalname = Buffer.from(f.originalname, 'latin1').toString('utf8');
        contractText = await extractFileText(f.path, f.originalname);
      }

      if (tasks[task_id]) {
        // Update existing staged task
        const task = tasks[task_id];
        task.employee_id = employee_id;
        task.employee_name = employee_name;
        task.job_name = job_name;
        task.assessment_period = { start: start_date || "", end: end_date || "" };
        task.status = "PARSING";
        task.progress = 100;
        if (contractText) {
          task.contract_file = {
            id: uuidv4(),
            name: req.files.contract[0].originalname,
            path: req.files.contract[0].path,
            status: "SUCCESS",
            text: contractText
          };
        }
        res.json({ 
          code: 200, 
          data: { 
            task_id, 
            contractText: task.contract_file?.text || "", 
            deliverables: task.deliverable_files.map(f => ({ name: f.name, text: f.text })) 
          } 
        });
      } else {
        // Fallback for direct upload legacy flow
        const deliverables: { name: string; text: string }[] = [];
        if (req.files?.deliverables) {
          for (const f of req.files.deliverables) {
            f.originalname = Buffer.from(f.originalname, 'latin1').toString('utf8');
            const text = await extractFileText(f.path, f.originalname);
            deliverables.push({ name: f.originalname, text });
          }
        }

        tasks[task_id] = {
          task_id,
          status: "PARSING",
          progress: 100,
          employee_id,
          employee_name,
          job_name,
          assessment_period: { start: start_date || "", end: end_date || "" },
          deliverable_files: (req.files?.deliverables || []).map((f: any, i: number) => ({
            id: uuidv4(),
            name: f.originalname,
            path: f.path,
            status: "SUCCESS",
            text: deliverables[i]?.text
          })),
          contract_file: req.files?.contract?.[0] ? {
            id: uuidv4(),
            name: req.files.contract[0].originalname,
            path: req.files.contract[0].path,
            status: "SUCCESS",
            text: contractText
          } : undefined,
          evidences: [],
          clauses: [],
          clause_results: [],
          manual_calibrations: []
        };

        res.json({ code: 200, data: { task_id, contractText, deliverables } });
      }
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: 500, message: "Server error" });
    }
  });

  // 2. Sync results from Frontend (Optimized for Incremental Updates)
  app.post("/api/v1/evaluation/tasks/:task_id/sync-results", (req, res) => {
    const task = tasks[req.params.task_id];
    if (!task) {
      console.warn(`Sync failed: Task ${req.params.task_id} not found.`);
      return res.status(404).json({ code: 404, message: "Not found" });
    }
    
    const { 
      clauses, 
      evidences, 
      results, 
      value_creation, 
      overall_summary, 
      category_stats,
      competency_analysis,
      status, 
      is_append = true 
    } = req.body;

    console.log(`Syncing Task ${req.params.task_id}: is_append=${is_append}, evidences=${evidences?.length}, results=${results?.length}, status=${status}`);

    if (!task.evidences) task.evidences = [];
    if (!task.clause_results) task.clause_results = [];

    // Merge Clauses
    if (clauses && clauses.length > 0) {
      if (!task.clauses) task.clauses = [];
      task.clauses = is_append ? [...task.clauses, ...clauses.filter((c: any) => !task.clauses.some(tc => tc.clause_id === c.clause_id))] : clauses;
    }

    // Merge Evidences
    if (evidences && evidences.length > 0) {
      if (is_append) {
        const existingIds = new Set(task.evidences.map(e => e.evidence_id));
        const newEvidences = evidences.filter((e: any) => !existingIds.has(e.evidence_id));
        task.evidences = [...task.evidences, ...newEvidences];
        console.log(`Appended ${newEvidences.length} evidences to Task ${task.task_id}. Total: ${task.evidences.length}`);
      } else {
        task.evidences = evidences;
        console.log(`Overwrote evidences for Task ${task.task_id}. Total: ${task.evidences.length}`);
      }
    }

    // Merge Clause Results
    if (results && results.length > 0) {
      if (is_append) {
        const existingIds = new Set(task.clause_results.map(r => r.clause_id));
        const newResults = results.filter((r: any) => !existingIds.has(r.clause_id));
        task.clause_results = [...task.clause_results, ...newResults];
      } else {
        task.clause_results = results;
      }
    }

    if (value_creation) task.value_creation = value_creation;
    if (overall_summary) task.overall_summary = overall_summary;
    if (category_stats) task.category_stats = category_stats;
    if (competency_analysis) task.competency_analysis = competency_analysis;
    
    if (status) {
      task.status = status;
      console.log(`Task ${task.task_id} status updated to: ${status}`);
    }

    res.json({ 
      code: 200, 
      message: "Sync successful", 
      evidence_count: task.evidences.length,
      status: task.status
    });
  });

  // NEW: Upsert/Update Task metadata and results
  app.post("/api/v1/evaluation/tasks/:task_id/upsert", (req, res) => {
    const task_id = req.params.task_id;
    if (!tasks[task_id]) {
      // Create if doesn't exist (e.g. from a direct upsert call)
      tasks[task_id] = {
        task_id,
        status: "PENDING",
        progress: 0,
        employee_id: "",
        employee_name: "",
        job_name: "",
        assessment_period: { start: "", end: "" },
        deliverable_files: [],
        evidences: [],
        clauses: [],
        clause_results: [],
        manual_calibrations: []
      };
    }
    
    const task = tasks[task_id];
    const { 
      employee_id, employee_name, job_name, 
      evaluation_period, assessment_period,
      clauses, results, evidences, 
      category_stats, competency_analysis,
      overall_summary, value_creation,
      status 
    } = req.body;

    if (employee_id !== undefined) task.employee_id = employee_id;
    if (employee_name !== undefined) task.employee_name = employee_name;
    if (job_name !== undefined) task.job_name = job_name;
    
    if (assessment_period !== undefined) {
      task.assessment_period = assessment_period;
    } else if (evaluation_period !== undefined) {
      // Handle "Start ~ End" string format if provided from frontend
      const parts = String(evaluation_period).split("~");
      if (parts.length === 2) {
        task.assessment_period = { start: parts[0].trim(), end: parts[1].trim() };
      }
    }

    if (clauses) task.clauses = clauses;
    if (results) task.clause_results = results;
    if (evidences) task.evidences = evidences;
    if (category_stats) task.category_stats = category_stats;
    if (competency_analysis) task.competency_analysis = competency_analysis;
    if (overall_summary) task.overall_summary = overall_summary;
    if (value_creation) task.value_creation = value_creation;
    if (status) task.status = status;

    console.log(`Upserted Task ${task_id}: status=${task.status}, clauses=${task.clauses?.length}`);
    res.json({ code: 200, message: "Upsert successful", task_id });
  });

  // 3. Status and fetchers
  app.get("/api/v1/evaluation/tasks/:task_id/status", (req, res) => {
    const task = tasks[req.params.task_id];
    res.json({ 
      code: 200, 
      data: task ? { 
        status: task.status, 
        progress: task.progress,
        contractText: task.contract_file?.text,
        deliverables: task.deliverable_files.map(f => ({ name: f.name, text: f.text }))
      } : {} 
    });
  });

  app.get("/api/v1/evaluation/tasks/:task_id/evidences", (req, res) => {
    res.json({ code: 200, data: { evidences: tasks[req.params.task_id]?.evidences || [] } });
  });

  app.get("/api/v1/evaluation/tasks/:task_id/contract-clauses", (req, res) => {
    res.json({ code: 200, data: { clauses: tasks[req.params.task_id]?.clauses || [] } });
  });

  app.get("/api/v1/evaluation/tasks/:task_id/clause-results", (req, res) => {
    const task = tasks[req.params.task_id];
    res.json({ 
      code: 200, 
      data: { 
        clause_results: task?.clause_results || [],
        value_creation: task?.value_creation || null,
        overall_summary: task?.overall_summary || null,
        category_stats: task?.category_stats || [],
        competency_analysis: task?.competency_analysis || null
      } 
    });
  });

  app.post("/api/v1/evaluation/tasks/:task_id/manual-review", (req, res) => {
    const task = tasks[req.params.task_id];
    if (task) {
      task.manual_calibrations = req.body.items;
      task.status = "REPORT_READY";
    }
    res.json({ code: 200 });
  });

  app.post("/api/v1/evaluation/tasks/:task_id/generate-report", (req, res) => {
    generateTaskReport(req.params.task_id);
    res.json({ code: 200 });
  });

  app.get("/api/v1/evaluation/tasks/:task_id/report", (req, res) => {
    res.json({ code: 200, data: tasks[req.params.task_id]?.report });
  });

  // AI Proxy Endpoint (Fixes CORS for local/remote LLMs and secures API keys)
  app.post("/api/v1/ai/call", async (req, res) => {
    const { prompt, config } = req.body;
    
    try {
      if (config.provider === 'gemini') {
        if (!GEMINI_API_KEY) {
          return res.status(401).json({ 
            code: 401, 
            message: "Gemini API Key 缺失。请在【Settings > Secrets】中添加并配置 GEMINI_API_KEY。" 
          });
        }

        console.log(`AI Proxy [Gemini]: Calling gemini-3-flash-preview...`);
        try {
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
              temperature: 0.2,
              topP: 0.1,
            }
          });
          const text = response.text || "";
          console.log(`AI Proxy [Gemini]: Success. Response length: ${text.length}`);
          return res.json({ code: 200, data: text });
        } catch (apiErr: any) {
          console.error("Gemini API Error:", apiErr);
          // Check for specifically invalid key errors to guide the user
          const errString = JSON.stringify(apiErr);
          if (errString.includes("API_KEY_INVALID") || (apiErr.status === 400 && errString.includes("key"))) {
            return res.status(400).json({ 
              code: 400, 
              message: "Gemini API Key 无效。请在【Settings > Secrets】中检查并更新您的 API Key。" 
            });
          }
          throw apiErr; // Fall through to general error handler
        }
      }

      if (config.provider !== 'local') {
        return res.status(400).json({ code: 400, message: "Unsupported provider." });
      }

      let targetUrl = config.localUrl || "";
      if (!targetUrl) {
        throw new Error("Local LLM URL is not configured.");
      }

      // Connectivity warning for localhost
      const urlObj = new URL(targetUrl);
      if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
        console.warn("AI Proxy detected localhost target. Note: The server is running in a Cloud container and cannot reach your computer's 'localhost' without a tunnel (like ngrok).");
      }

      if (targetUrl && !targetUrl.endsWith('/chat/completions') && !targetUrl.endsWith('/completions')) {
        targetUrl = targetUrl.endsWith('/') ? targetUrl + 'chat/completions' : targetUrl + '/chat/completions';
      }
      
      const body = {
        model: config.localModel || "default",
        messages: [{ role: 'user', content: prompt }],
        temperature: config.temperature || 0.1
      };

      console.log(`AI Proxy: Calling ${targetUrl} with model ${body.model}`);

      const aiResponse = await fetch(targetUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          ...(config.localApiKey ? { 'Authorization': `Bearer ${config.localApiKey}` } : {}) 
        },
        body: JSON.stringify(body)
      }).catch(err => {
        if (err.name === 'AbortError') throw new Error("AI Proxy: Connection timed out.");
        if (err.code === 'ECONNREFUSED') throw new Error(`AI Proxy: Connection refused to ${targetUrl}. Is your local LLM running and accessible?`);
        throw err;
      });
      
      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        const lowerText = errText.toLowerCase();
        const isHtml = lowerText.includes("<html") || lowerText.includes("<!doctype html");
        const cleanMessage = isHtml ? `HTTP ${aiResponse.status} (Target server returned HTML instead of JSON. Ensure your endpoint URL is correct.)` : errText.substring(0, 500);
        throw new Error(`Local AI API Error (${aiResponse.status}): ${cleanMessage}`);
      }

      const result = await aiResponse.json() as any;
      const content = result.choices?.[0]?.message?.content || result.choices?.[0]?.text || "";
      return res.json({ code: 200, data: content });
    } catch (err: any) {
      console.error("AI Proxy Error details:", err);
      res.status(500).json({ code: 500, message: err.message || "Unknown proxy error" });
    }
  });

  app.get("/api/config/ai", (req, res) => res.json(aiConfig));
  app.post("/api/config/ai", (req, res) => {
    aiConfig = req.body;
    res.json({ code: 200 });
  });

  app.post("/api/v1/files/upload", upload.single("file"), async (req: any, res) => {
    console.log("Quick upload hit:", req.file?.originalname);
    try {
      if (!req.file) {
        console.error("Quick upload: No file attached");
        return res.status(400).json({ code: 400, message: "No file uploaded" });
      }
      const f = req.file;
      try {
        f.originalname = Buffer.from(f.originalname, 'latin1').toString('utf8');
      } catch (err) {
        console.warn("Filename decoding failed, using raw name", err);
      }
      const text = await extractFileText(f.path, f.originalname);
      res.json({ code: 200, data: { extractedText: text } });
    } catch (e: any) {
      console.error("Quick extraction error:", e);
      res.status(500).json({ code: 500, message: e.message || "Internal extraction error" });
    }
  });

  // Global Error Handler to ensure all errors return JSON instead of HTML
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("URGENT: Unhandled Server Error:", err);
    res.status(err.status || 500).json({
      code: err.status || 500,
      message: err.message || "系统内部错误",
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://localhost:${PORT}`));
}

startServer();
