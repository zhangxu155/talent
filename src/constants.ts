/**
 * Performance Evaluation Phrase Templates (Performance Report Speech)
 */
export const EVALUATION_TEMPLATES = {
  OVERALL_EVALUATION: {
    template: "评价期内共设计 {taskCount} 个任务指标，覆盖 {milestoneCount} 项里程碑，完成 {completedCount} 项，其中按期完成 {onTimeCount} 项，提前完成 {earlyCount} 项，拖期完成 {delayedCount} 项，整体评分 {overallScore} 分，绩效等级 {performanceGrade}；培养团队成员 {teamCount} 人，开展 {trainingTopics} 等专业培训，提升团队成员 {capabilities} 等能力，能力有效沉淀",
    placeholders: ["taskCount", "milestoneCount", "completedCount", "onTimeCount", "earlyCount", "delayedCount", "overallScore", "performanceGrade", "teamCount", "trainingTopics", "capabilities"]
  },
  CORE_STRENGTHS: {
    template: "能够主导完成 {majorTasks} 重难点任务，工作成果可量化、可落地，在 {excellenceAreas} 方面表现出色，能够高效完成本职工作及交办专项任务，业绩产出稳定可控",
    placeholders: ["majorTasks", "excellenceAreas"]
  },
  AREAS_FOR_IMPROVEMENT: {
    template: "在 {projectTask} 工作产出了 {actualResults} 成果，距离目标仍有一定差距，且实施过程存在 {issues} 等情况，建议加强 {suggestions}",
    placeholders: ["projectTask", "actualResults", "issues", "suggestions"]
  }
};

/**
 * Suggestions for improvement based on categories
 */
export const IMPROVEMENT_SUGGESTION_POOL = [
  "加强统筹规划",
  "跨领域系统思维及创新突破",
  "战略视角",
  "复盘与细节把控"
];
