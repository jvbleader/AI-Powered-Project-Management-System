import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ConfirmDialogProvider } from "@/components/confirm-dialog";
import { taskApi } from "@/services/api";
import type { Task } from "@/types";
import { TaskDetailModal } from "./task-detail-modal";

jest.mock("@/services/api", () => ({
  taskApi: {
    getEnrichedTask: jest.fn(),
    listLogworks: jest.fn(),
    getLogs: jest.fn(),
    update: jest.fn(),
    updateAssignee: jest.fn(),
    remove: jest.fn(),
  },
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const task: Task = {
  id: "42",
  key: "TASK-42",
  projectId: "10",
  sprintId: null,
  parentTaskId: null,
  title: "Kiểm tra debounce ET",
  description: "",
  status: "TODO",
  priority: "HIGH",
  assigneeId: "usr-2",
  assigneeName: "Người thực hiện",
  assigneeEmail: "assignee@example.com",
  reporterId: "usr-1",
  startDate: "2026-08-19",
  dueDate: "2026-08-19",
  estimateHours: 4,
  spentHours: 0,
  tags: [],
  blockers: [],
  commentsCount: 0,
  lastActivity: "2026-08-11T00:00:00Z",
};

describe("TaskDetailModal estimated hours", () => {
  beforeEach(() => {
    jest.mocked(taskApi.getEnrichedTask).mockResolvedValue({ data: task } as never);
    jest.mocked(taskApi.listLogworks).mockResolvedValue({ data: [] } as never);
    jest.mocked(taskApi.getLogs).mockResolvedValue({ data: [] } as never);
    jest.mocked(taskApi.update).mockResolvedValue({ data: task } as never);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("saves only the final ET value after two seconds without input", async () => {
    render(
      <ConfirmDialogProvider>
        <TaskDetailModal
          taskId={task.id}
          isOpen
          onClose={jest.fn()}
          onTaskUpdated={jest.fn()}
          users={[]}
          viewerId="usr-1"
          canManage
        />
      </ConfirmDialogProvider>,
    );

    const input = await screen.findByLabelText("Thời gian ước tính");
    await waitFor(() => expect(input).toHaveValue(4));
    jest.useFakeTimers();

    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.change(input, { target: { value: "6" } });
    fireEvent.change(input, { target: { value: "7" } });

    expect(input).toHaveValue(7);
    expect(jest.getTimerCount()).toBe(1);
    act(() => jest.advanceTimersByTime(1_999));
    expect(taskApi.update).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(taskApi.update).toHaveBeenCalledTimes(1);
    });
    expect(taskApi.update).toHaveBeenCalledWith(task.id, {
      estimateHours: 7,
      dueDate: "2026-08-19",
    });
  });
});
