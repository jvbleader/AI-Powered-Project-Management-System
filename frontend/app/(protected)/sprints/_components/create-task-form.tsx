import { type FormEvent, useState, useEffect } from "react";
import { Surface } from "@/components/ui";
import { UserProfile, EnrichedTask } from "@/types";
import { roleLabel } from "@/lib/utils/format";

type CreateTaskFormProps = {
  users: UserProfile[];
  defaultAssigneeId: string;
  onSubmit: (data: {
    title: string;
    description: string;
    dueDate: string;
    estimateHours: string;
    assigneeId: string;
    priority: EnrichedTask["priority"];
  }) => Promise<void>;
  error: string | null;
  onClearError: () => void;
};

export function CreateTaskForm({
  users,
  defaultAssigneeId,
  onSubmit,
  error,
  onClearError,
}: CreateTaskFormProps) {
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("2026-07-04");
  const [taskEstimateHours, setTaskEstimateHours] = useState("6");
  const [taskAssigneeId, setTaskAssigneeId] = useState(defaultAssigneeId);
  const [taskPriority, setTaskPriority] = useState<EnrichedTask["priority"]>("HIGH");

  useEffect(() => {
    if (defaultAssigneeId && !taskAssigneeId) {
      setTaskAssigneeId(defaultAssigneeId);
    }
  }, [defaultAssigneeId, taskAssigneeId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onClearError();
    await onSubmit({
      title: taskTitle,
      description: taskDescription,
      dueDate: taskDueDate,
      estimateHours: taskEstimateHours,
      assigneeId: taskAssigneeId,
      priority: taskPriority,
    });
    // On success, reset
    setTaskTitle("");
    setTaskDescription("");
    setTaskEstimateHours("6");
  }

  return (
    <Surface title="Tạo task mới" kicker="Task setup">
      <form className="surface-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            <span>Tiêu đề</span>
            <input
              value={taskTitle}
              onChange={(event) => setTaskTitle(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Người phụ trách</span>
            <select
              value={taskAssigneeId}
              onChange={(event) => setTaskAssigneeId(event.target.value)}
              required
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} - {roleLabel(user.role)}
                </option>
              ))}
            </select>
          </label>
          <label className="form-grid-span">
            <span>Mô tả</span>
            <textarea
              value={taskDescription}
              onChange={(event) => setTaskDescription(event.target.value)}
              rows={4}
              required
            />
          </label>
          <label>
            <span>Hạn chót</span>
            <input
              type="date"
              value={taskDueDate}
              onChange={(event) => setTaskDueDate(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Ước tính (giờ)</span>
            <input
              type="number"
              min="1"
              value={taskEstimateHours}
              onChange={(event) => setTaskEstimateHours(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Mức ưu tiên</span>
            <select
              value={taskPriority}
              onChange={(event) => setTaskPriority(event.target.value as EnrichedTask["priority"])}
            >
              <option value="MEDIUM">Trung bình</option>
              <option value="HIGH">Cao</option>
              <option value="CRITICAL">Khẩn cấp</option>
            </select>
          </label>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="form-actions">
          <button type="submit" className="primary-button">
            Tạo task
          </button>
        </div>
      </form>
    </Surface>
  );
}
