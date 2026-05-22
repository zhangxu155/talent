/**
 * 项目考评逻辑测试用例 (研发参考)
 */

export const mockContractResponse = [
  {
    clause_id: "c1",
    category: "技术研发",
    title: "完成自研框架 2.0 升级",
    milestones: [
      { date: "2024-06-30", content: "完成 Beta 版本内测及半年功能评审 (半年目标)" },
      { date: "2024-12-31", content: "全量上线并完成 100% 业务迁移 (全年目标)" }
    ]
  }
];

export const testParsingLogic = (dateStr: string) => {
  const month = parseInt(dateStr.split('-')[1]);
  return month <= 6 ? "上半年" : "下半年";
};

// 预期的交付考核逻辑
console.log("Testing Parsing Logic for 2024-06-30:", testParsingLogic("2024-06-30") === "上半年");
