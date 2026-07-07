import { useState } from "react";
import Image from "next/image";
import { Surface, StatusPill, StatCard } from "@/components/ui";
import { taskPriorityLabel, taskStatusLabel, formatHours } from "@/lib/utils/format";
import type { EnrichedTask } from "@/types";
import { LogworkModal } from "./logwork-modal";
import { useRouter } from "next/navigation";

interface TaskDetailsProps {
  task: EnrichedTask;
  viewerId: string;
}

export function TaskDetails({ task, viewerId }: TaskDetailsProps) {
  const router = useRouter();
  const [isLogworkModalOpen, setIsLogworkModalOpen] = useState(false);

  return (
    <>
      <Surface title={task.title} kicker={`Nhiệm vụ: ${task.key} - Dự án: ${task.project.name}`}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", gap: "1rem" }}>
            <StatusPill label={taskStatusLabel(task.status)} tone="neutral" />
            <StatusPill label={taskPriorityLabel(task.priority)} tone="accent" />
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="secondary-button"
              onClick={() => router.push("/tasks")}
            >
              Quay lại
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => setIsLogworkModalOpen(true)}
            >
              + Logwork
            </button>
          </div>
        </div>

        <section className="stat-grid" style={{ marginBottom: "2rem" }}>
          <StatCard
            label="Trạng thái"
            value={taskStatusLabel(task.status)}
            note={`Ngày hết hạn: ${task.dueDate}`}
            tone="neutral"
          />
          <StatCard
            label="Thời gian ước tính (ET)"
            value={formatHours(task.estimateHours)}
            note={`Đã log: ${formatHours(task.spentHours)}`}
            tone="accent"
          />
          <StatCard
            label="Người thực hiện"
            value={task.assignee.name}
            note={task.assignee.title}
            tone="critical"
          />
        </section>

        <div>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Mô tả nhiệm vụ
          </h3>
          <p style={{ whiteSpace: "pre-wrap", color: "var(--foreground-muted)", lineHeight: 1.6 }}>
            {task.description || "Chưa có mô tả."}
          </p>
        </div>
      </Surface>

      <LogworkModal
        isOpen={isLogworkModalOpen}
        onClose={() => setIsLogworkModalOpen(false)}
        taskId={task.id}
        userId={viewerId}
      />
    </>
  );
}
