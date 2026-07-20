"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { GlobalDashboardOverview as GlobalDashboardOverviewType } from "@/types";
import { Surface, ProgressBar, DonutChart, ColumnChart } from "@/components/ui";

type GlobalDashboardOverviewProps = {
  overview: GlobalDashboardOverviewType | null;
};

export function GlobalDashboardOverview({ overview }: GlobalDashboardOverviewProps) {
  if (!overview) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "var(--foreground-muted)" }}>
        Đang tải dữ liệu tổng quan...
      </div>
    );
  }

  const {
    totalProjects,
    activeProjects,
    completedProjects,
    taskSummary,
    projectHealths,
    upcomingDeadlines,
    overdueTasks,
    completedTasks,
    activeSprints,
    globalWorkload,
  } = overview;

  const [isOverdueModalOpen, setIsOverdueModalOpen] = useState(false);
  const [isTotalProjectsModalOpen, setIsTotalProjectsModalOpen] = useState(false);
  const [isCompletedTasksModalOpen, setIsCompletedTasksModalOpen] = useState(false);

  const totalTasks = taskSummary.total;
  const taskCompletionRate = totalTasks > 0 ? Math.round((taskSummary.done / totalTasks) * 100) : 0;

  // Calculate project health distribution
  const healthCounts = projectHealths.reduce(
    (acc, ph) => {
      acc[ph.health]++;
      return acc;
    },
    { "on-track": 0, watch: 0, critical: 0 }
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Top KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1.5rem",
        }}
      >
        <div
          onClick={() => setIsTotalProjectsModalOpen(true)}
          style={{
            padding: "1.5rem",
            borderRadius: "16px",
            background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
            border: "1px solid rgba(37, 99, 235, 0.1)",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
            cursor: "pointer",
            transition: "transform 0.2s ease, box-shadow 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 6px 12px -2px rgba(37, 99, 235, 0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.05)";
          }}
        >
          <div style={{ color: "#1e3a8a", fontSize: "0.875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Tổng Dự Án</div>
          <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "#1d4ed8", marginTop: "0.5rem" }}>{totalProjects}</div>
          <div style={{ fontSize: "0.875rem", color: "#3b82f6", marginTop: "0.25rem" }}>{activeProjects} Đang chạy &bull; {completedProjects} Hoàn thành</div>
        </div>

        <div
          onClick={() => setIsCompletedTasksModalOpen(true)}
          style={{
            padding: "1.5rem",
            borderRadius: "16px",
            background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
            border: "1px solid rgba(22, 163, 74, 0.1)",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
            cursor: "pointer",
            transition: "transform 0.2s ease, box-shadow 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 6px 12px -2px rgba(22, 163, 74, 0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.05)";
          }}
        >
          <div style={{ color: "#14532d", fontSize: "0.875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Nhiệm vụ hoàn thành</div>
          <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "#15803d", marginTop: "0.5rem" }}>{taskCompletionRate}%</div>
          <div style={{ fontSize: "0.875rem", color: "#16a34a", marginTop: "0.25rem" }}>{taskSummary.done} / {totalTasks} Tasks (Toàn hệ thống)</div>
        </div>

        <div
          onClick={() => setIsOverdueModalOpen(true)}
          style={{
            padding: "1.5rem",
            borderRadius: "16px",
            background: "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)",
            border: "1px solid rgba(220, 38, 38, 0.1)",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
            cursor: "pointer",
            transition: "transform 0.2s ease, box-shadow 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 6px 12px -2px rgba(220, 38, 38, 0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.05)";
          }}
        >
          <div style={{ color: "#7f1d1d", fontSize: "0.875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Cảnh báo / Quá hạn</div>
          <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "#b91c1c", marginTop: "0.5rem" }}>{taskSummary.overdue}</div>
          <div style={{ fontSize: "0.875rem", color: "#dc2626", marginTop: "0.25rem" }}>Nhiệm vụ cần xử lý gấp</div>
        </div>
      </div>

      {/* Visual Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        {/* Task Distribution Donut Chart */}
        <Surface title="Phân bổ nhiệm vụ">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2rem", padding: "1rem" }}>
            <div style={{ flex: 1, maxWidth: "200px" }}>
              <DonutChart
                segments={[
                  { value: taskSummary.todo, tone: "todo" },
                  { value: taskSummary.inProgress, tone: "progress" },
                  { value: taskSummary.done, tone: "done" },
                ]}
                centerLabel="Tổng Tasks"
                centerValue={String(totalTasks)}
              />
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#facc15" }}></div>
                  <span style={{ fontSize: "0.875rem", color: "var(--foreground-muted)" }}>Cần làm (Todo)</span>
                </div>
                <strong style={{ fontSize: "1rem" }}>{taskSummary.todo}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#3b82f6" }}></div>
                  <span style={{ fontSize: "0.875rem", color: "var(--foreground-muted)" }}>Đang xử lý</span>
                </div>
                <strong style={{ fontSize: "1rem" }}>{taskSummary.inProgress}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#22c55e" }}></div>
                  <span style={{ fontSize: "0.875rem", color: "var(--foreground-muted)" }}>Hoàn thành</span>
                </div>
                <strong style={{ fontSize: "1rem" }}>{taskSummary.done}</strong>
              </div>
            </div>
          </div>
        </Surface>

        {/* Project Health Donut Chart */}
        <Surface title="Sức khỏe dự án (Health)">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2rem", padding: "1rem" }}>
            <div style={{ flex: 1, maxWidth: "200px" }}>
              <DonutChart
                segments={[
                  { value: healthCounts["on-track"], tone: "done" },
                  { value: healthCounts.watch, tone: "todo" },
                  { value: healthCounts.critical, tone: "outdate" },
                ]}
                centerLabel="Đang chạy"
                centerValue={String(activeProjects)}
              />
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#22c55e" }}></div>
                  <span style={{ fontSize: "0.875rem", color: "var(--foreground-muted)" }}>Tốt (On-track)</span>
                </div>
                <strong style={{ fontSize: "1rem" }}>{healthCounts["on-track"]}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#facc15" }}></div>
                  <span style={{ fontSize: "0.875rem", color: "var(--foreground-muted)" }}>Lưu ý (Watch)</span>
                </div>
                <strong style={{ fontSize: "1rem" }}>{healthCounts.watch}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ef4444" }}></div>
                  <span style={{ fontSize: "0.875rem", color: "var(--foreground-muted)" }}>Rủi ro (Critical)</span>
                </div>
                <strong style={{ fontSize: "1rem" }}>{healthCounts.critical}</strong>
              </div>
            </div>
          </div>
        </Surface>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.5rem", alignItems: "stretch" }}>
        
        {/* Project Progress Section */}
        <Surface title="Tiến độ chi tiết từng dự án" style={{ display: "flex", flexDirection: "column", height: "100%" }} aside={<Link href="/projects" style={{ fontSize: "0.875rem", color: "var(--primary-base)", fontWeight: 500, textDecoration: "none" }}>Quản lý dự án &rarr;</Link>}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", flex: 1 }}>
            {projectHealths.length > 0 ? (
              <ColumnChart 
                items={projectHealths.map((ph) => ({
                  label: ph.name,
                  value: ph.progress,
                  tone: ph.health as "on-track" | "watch" | "critical",
                  href: `/projects/${ph.id}`
                }))}
              />
            ) : (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--foreground-muted)", background: "var(--surface-sunken)", borderRadius: "12px" }}>
                Chưa có dự án nào
              </div>
            )}
          </div>
        </Surface>

        {/* Upcoming Deadlines */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", height: "100%" }}>
          <Surface title="Cảnh báo" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flex: 1 }}>
              {upcomingDeadlines.length > 0 ? upcomingDeadlines.map((task) => (
                <Link key={task.id} href={`/projects/${task.projectId || ""}?tab=gantt&highlightTaskId=${task.id}&highlightColor=blue`} style={{ textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", gap: "0.25rem", padding: "0.75rem", border: "1px solid rgba(148,163,184,0.2)", borderRadius: "8px", background: "var(--surface)", cursor: "pointer", transition: "background-color 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(241,245,249,0.8)"} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "var(--surface)"}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--ink)" }}>{task.title}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.25rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--primary-base)", background: "rgba(37,99,235,0.1)", padding: "2px 6px", borderRadius: "4px" }}>{task.key}</span>
                      {task.projectName && <span style={{ fontSize: "0.75rem", color: "var(--foreground-muted)" }}>{task.projectName}</span>}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: task.dueDate && new Date(task.dueDate) < new Date() ? "var(--danger-base)" : "var(--foreground-muted)", fontWeight: 500 }}>
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : "N/A"}
                    </span>
                  </div>
                </Link>
              )) : (
                <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--foreground-muted)", fontSize: "0.875rem" }}>Không có task nào sắp tới hạn</div>
              )}
            </div>
          </Surface>
        </div>

      </div>
      {/* Overdue Tasks Modal */}
      {isOverdueModalOpen && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 9999,
          padding: "1rem"
        }} onClick={() => setIsOverdueModalOpen(false)}>
          <div style={{
            background: "#ffffff",
            borderRadius: "12px",
            width: "100%",
            maxWidth: "800px",
            maxHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "1.5rem", borderBottom: "1px solid rgba(148,163,184,0.2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1.25rem", color: "var(--ink)", fontWeight: 600 }}>Danh sách Nhiệm vụ Quá hạn</h3>
              <button 
                onClick={() => setIsOverdueModalOpen(false)}
                style={{ background: "transparent", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--foreground-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                &times;
              </button>
            </div>
            <div style={{ padding: "1rem", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {overdueTasks && overdueTasks.length > 0 ? overdueTasks.map((task) => (
                <Link key={task.id} href={`/projects/${task.projectId || ""}?tab=gantt&highlightTaskId=${task.id}&highlightColor=red`} onClick={() => setIsOverdueModalOpen(false)} style={{ textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", gap: "0.25rem", padding: "0.75rem", border: "1px solid rgba(220,38,38,0.2)", borderRadius: "8px", background: "rgba(254,242,242,0.5)", cursor: "pointer", transition: "background-color 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(254,226,226,0.8)"} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "rgba(254,242,242,0.5)"}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--ink)" }}>{task.title}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.25rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--primary-base)", background: "rgba(37,99,235,0.1)", padding: "2px 6px", borderRadius: "4px" }}>{task.key}</span>
                      {task.projectName && <span style={{ fontSize: "0.75rem", color: "var(--foreground-muted)" }}>{task.projectName}</span>}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "var(--danger-base)", fontWeight: 500 }}>
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : "N/A"}
                    </span>
                  </div>
                </Link>
              )) : (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--foreground-muted)", fontSize: "0.875rem" }}>Tuyệt vời! Không có nhiệm vụ nào quá hạn.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Total Projects Modal */}
      {isTotalProjectsModalOpen && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 9999,
          padding: "1rem"
        }} onClick={() => setIsTotalProjectsModalOpen(false)}>
          <div style={{
            background: "#ffffff",
            borderRadius: "12px",
            width: "100%",
            maxWidth: "800px",
            maxHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "1.5rem", borderBottom: "1px solid rgba(148,163,184,0.2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1.25rem", color: "var(--ink)", fontWeight: 600 }}>Danh sách Dự án Toàn hệ thống</h3>
              <button 
                onClick={() => setIsTotalProjectsModalOpen(false)}
                style={{ background: "transparent", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--foreground-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                &times;
              </button>
            </div>
            <div style={{ padding: "1rem", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {projectHealths && projectHealths.length > 0 ? projectHealths.map((project) => (
                <Link key={project.id} href={`/projects/${project.id}`} onClick={() => setIsTotalProjectsModalOpen(false)} style={{ textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", gap: "0.5rem", padding: "1rem", border: "1px solid rgba(148,163,184,0.2)", borderRadius: "8px", background: "#f8fafc", cursor: "pointer", transition: "background-color 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f1f5f9"} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#f8fafc"}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--ink)" }}>{project.name}</span>
                    <span style={{ fontSize: "0.75rem", padding: "4px 8px", borderRadius: "12px", fontWeight: 500, backgroundColor: project.status === "COMPLETED" ? "#dcfce7" : "#dbeafe", color: project.status === "COMPLETED" ? "#16a34a" : "#2563eb" }}>
                      {project.status === "COMPLETED" ? "Hoàn thành" : "Đang chạy"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.25rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--foreground-muted)" }}>Tiến độ: {project.progress}%</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--foreground-muted)" }}>• {project.totalTasks} Tasks</span>
                    </div>
                    <span style={{ fontSize: "0.75rem", fontWeight: 500, color: project.health === "critical" ? "#dc2626" : project.health === "watch" ? "#d97706" : "#16a34a" }}>
                      {project.health === "critical" ? "Nguy hiểm" : project.health === "watch" ? "Cảnh báo" : "Ổn định"}
                    </span>
                  </div>
                </Link>
              )) : (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--foreground-muted)", fontSize: "0.875rem" }}>Chưa có dự án nào.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Completed Tasks Modal */}
      {isCompletedTasksModalOpen && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 9999,
          padding: "1rem"
        }} onClick={() => setIsCompletedTasksModalOpen(false)}>
          <div style={{
            background: "#ffffff",
            borderRadius: "12px",
            width: "100%",
            maxWidth: "800px",
            maxHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "1.5rem", borderBottom: "1px solid rgba(148,163,184,0.2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1.25rem", color: "var(--ink)", fontWeight: 600 }}>Nhiệm vụ Vừa hoàn thành (Top 50)</h3>
              <button 
                onClick={() => setIsCompletedTasksModalOpen(false)}
                style={{ background: "transparent", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--foreground-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                &times;
              </button>
            </div>
            <div style={{ padding: "1rem", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {completedTasks && completedTasks.length > 0 ? completedTasks.map((task) => (
                <Link key={task.id} href={`/projects/${task.projectId || ""}?tab=gantt&highlightTaskId=${task.id}&highlightColor=green`} onClick={() => setIsCompletedTasksModalOpen(false)} style={{ textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", gap: "0.25rem", padding: "0.75rem", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "8px", background: "rgba(240,253,244,0.5)", cursor: "pointer", transition: "background-color 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(220,252,231,0.8)"} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "rgba(240,253,244,0.5)"}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--ink)" }}>{task.title}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.25rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--primary-base)", background: "rgba(37,99,235,0.1)", padding: "2px 6px", borderRadius: "4px" }}>{task.key}</span>
                      {task.projectName && <span style={{ fontSize: "0.75rem", color: "var(--foreground-muted)" }}>{task.projectName}</span>}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: 500 }}>
                      Hoàn thành
                    </span>
                  </div>
                </Link>
              )) : (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--foreground-muted)", fontSize: "0.875rem" }}>Chưa có nhiệm vụ nào hoàn thành.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
