export interface Milestone {
  date: string;
  content: string;
}

export interface Clause {
  clause_id: string;
  category: string;
  title: string;
  milestones: Milestone[];
}

export interface EvaluationResult {
  clause_id: string;
  completion_status: string;
  result: string;
  score: number;
  dimensions: {
    performance: { score: number; reason: string };
    competency: { score: number; reason: string };
    values: { score: number; reason: string };
  };
  evidence_summary: string;
  matched_evidence_ids: string[];
}

export interface Evidence {
  evidence_id: string;
  source_file_name: string;
  title: string;
  summary: string;
  keywords: string[];
}
