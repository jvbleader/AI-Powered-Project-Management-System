import { type FormEvent, useState } from "react";
import { Surface } from "@/components/ui";
import { Project } from "@/types";

type CreateSprintFormProps = {
  projectList: Project[];
  onSubmit: (data: { name: string; projectId: string; goal: string; start: string; end: string }) => Promise<void>;
  error: string | null;
  onClearError: () => void;
};

export function CreateSprintForm({ projectList, onSubmit, error, onClearError }: CreateSprintFormProps) {
  const [sprintName, setSprintName] = useState("");
  const [sprintProjectId, setSprintProjectId] = useState("");
  const [sprintGoal, setSprintGoal] = useState("");
  const [sprintStart, setSprintStart] = useState("2026-07-01");
  const [sprintEnd, setSprintEnd] = useState("2026-07-14");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onClearError();
    await onSubmit({
      name: sprintName,
      projectId: sprintProjectId,
      goal: sprintGoal,
      start: sprintStart,
      end: sprintEnd,
    });
    // On success, reset
    setSprintName("");
    setSprintGoal("");
  }

  return (
    <Surface title="Thiết lập sprint mới" kicker="Sprint setup">
      <form className="surface-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            <span>Tên sprint</span>
            <input value={sprintName} onChange={(event) => setSprintName(event.target.value)} required />
          </label>
          <label>
            <span>Dự án</span>
            <select value={sprintProjectId} onChange={(event) => setSprintProjectId(event.target.value)} required>
              <option value="">Chọn dự án</option>
              {projectList.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-grid-span">
            <span>Mục tiêu trọng tâm</span>
            <textarea value={sprintGoal} onChange={(event) => setSprintGoal(event.target.value)} rows={3} required />
          </label>
          <label>
            <span>Ngày bắt đầu</span>
            <input type="date" value={sprintStart} onChange={(event) => setSprintStart(event.target.value)} required />
          </label>
          <label>
            <span>Ngày kết thúc</span>
            <input type="date" value={sprintEnd} onChange={(event) => setSprintEnd(event.target.value)} required />
          </label>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="form-actions">
          <button type="submit" className="primary-button">
            Tạo sprint
          </button>
        </div>
      </form>
    </Surface>
  );
}
