import re

with open('/Users/nguyenbaothach/Onboard/PPGit/AI-Powered-Project-Management-System/frontend/app/(protected)/dashboard/_components/global-dashboard-overview.tsx', 'r') as f:
    content = f.read()

# Card 1 (Dự án)
card1_old = """        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsTotalProjectsModalOpen(true)}
          onKeyDown={(e) => e.key === "Enter" && setIsTotalProjectsModalOpen(true)}
          style={{
            ...kpiBaseStyle,
            background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
            border: "1px solid rgba(37, 99, 235, 0.12)",
          }}
        >
          <div
            style={{
              color: "#1e3a8a",
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Dự án
          </div>
          <div style={{ fontSize: "1.55rem", fontWeight: 800, color: "#1d4ed8", lineHeight: 1.05 }}>
            {activeProjects}
            <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#3b82f6" }}>
              {" "}
              / {totalProjects}
            </span>
          </div>
          <div style={{ fontSize: "0.75rem", color: "#3b82f6" }}>
            Đang chạy · {completedProjects} hoàn thành
          </div>
        </div>"""

card1_new = """        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsTotalProjectsModalOpen(true)}
          onKeyDown={(e) => e.key === "Enter" && setIsTotalProjectsModalOpen(true)}
          style={{
            ...kpiBaseStyle,
            background: "var(--surface)",
            border: "1px solid var(--surface-border)",
          }}
        >
          <div
            style={{
              color: "var(--foreground-muted)",
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Dự án
          </div>
          <div style={{ fontSize: "1.55rem", fontWeight: 800, color: "var(--ink)", lineHeight: 1.05 }}>
            {activeProjects}
            <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--foreground-muted)" }}>
              {" "}
              / {totalProjects}
            </span>
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--foreground-muted)" }}>
            Đang chạy · {completedProjects} hoàn thành
          </div>
        </div>"""


# Card 2 (Việc đang mở)
card2_old = """        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsCompletedTasksModalOpen(true)}
          onKeyDown={(e) => e.key === "Enter" && setIsCompletedTasksModalOpen(true)}
          style={{
            ...kpiBaseStyle,
            background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
            border: "1px solid rgba(217, 119, 6, 0.18)",
          }}
        >
          <div
            style={{
              color: "#92400e",
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Việc đang mở
          </div>
          <div style={{ fontSize: "1.55rem", fontWeight: 800, color: "#78350f", lineHeight: 1.05 }}>
            {openTasks}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#b45309" }}>
            trên {totalTasks} tasks toàn hệ thống
          </div>
        </div>"""

card2_new = """        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsCompletedTasksModalOpen(true)}
          onKeyDown={(e) => e.key === "Enter" && setIsCompletedTasksModalOpen(true)}
          style={{
            ...kpiBaseStyle,
            background: "var(--surface)",
            border: "1px solid var(--surface-border)",
          }}
        >
          <div
            style={{
              color: "var(--foreground-muted)",
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Việc đang mở
          </div>
          <div style={{ fontSize: "1.55rem", fontWeight: 800, color: "var(--ink)", lineHeight: 1.05 }}>
            {openTasks}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--foreground-muted)" }}>
            trên {totalTasks} tasks toàn hệ thống
          </div>
        </div>"""

# Card 3 (Quá hạn)
card3_old = """        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsOverdueTasksModalOpen(true)}
          onKeyDown={(e) => e.key === "Enter" && setIsOverdueTasksModalOpen(true)}
          style={{
            ...kpiBaseStyle,
            background: "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)",
            border: "1px solid rgba(220, 38, 38, 0.12)",
          }}
        >
          <div
            style={{
              color: "#7f1d1d",
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Quá hạn
          </div>
          <div style={{ fontSize: "1.55rem", fontWeight: 800, color: "#b91c1c", lineHeight: 1.05 }}>
            {taskSummary.overdue}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#dc2626" }}>Cần xử lý gấp →</div>
        </div>"""

card3_new = """        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsOverdueTasksModalOpen(true)}
          onKeyDown={(e) => e.key === "Enter" && setIsOverdueTasksModalOpen(true)}
          style={{
            ...kpiBaseStyle,
            background: "var(--surface)",
            border: "1px solid var(--surface-border)",
          }}
        >
          <div
            style={{
              color: "var(--foreground-muted)",
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Quá hạn
          </div>
          <div style={{ fontSize: "1.55rem", fontWeight: 800, color: "var(--ink)", lineHeight: 1.05 }}>
            {taskSummary.overdue}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--foreground-muted)" }}>Cần xử lý gấp →</div>
        </div>"""

content = content.replace(card1_old, card1_new)
content = content.replace(card2_old, card2_new)
content = content.replace(card3_old, card3_new)

with open('/Users/nguyenbaothach/Onboard/PPGit/AI-Powered-Project-Management-System/frontend/app/(protected)/dashboard/_components/global-dashboard-overview.tsx', 'w') as f:
    f.write(content)

print("Fixed card styles")
