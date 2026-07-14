import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { AssistantBubble } from "./assistant-bubble";

jest.mock("@/services/api", () => ({
  aiApi: {
    quickResponse: jest.fn(),
  },
  projectApi: {
    list: jest.fn(),
  },
}));

const { aiApi, projectApi } = jest.requireMock("@/services/api") as {
  aiApi: {
    quickResponse: jest.Mock;
  };
  projectApi: {
    list: jest.Mock;
  };
};

describe("AssistantBubble", () => {
  beforeEach(() => {
    aiApi.quickResponse.mockReset();
    projectApi.list.mockReset();
  });

  it("shows user and assistant messages after clicking a suggested prompt", async () => {
    aiApi.quickResponse.mockResolvedValue({
      data: {
        action: "daily_priority",
        title: "Uu tien hom nay",
        summary: "Theo sat 2 task gan deadline.",
        evidence: ["TASK-12 sap den han"],
        recommendations: ["Nhac nguoi phu trach cap nhat"],
        entities: [],
        generatedAt: "2026-07-14T00:00:00.000Z",
        dataFreshnessNote: "Du lieu vua cap nhat",
      },
    });

    render(<AssistantBubble alertCount={2} projectId="63" />);

    fireEvent.click(await screen.findByRole("button", { name: "Mo tro ly AI" }));
    fireEvent.click(screen.getByRole("button", { name: "Hom nay toi nen chu y viec gi truoc?" }));

    expect(screen.getByText("Dang phan tich: Hom nay toi nen chu y viec gi truoc?")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Theo sat 2 task gan deadline.")).toBeInTheDocument();
    });

    const chatPanel = screen.getByRole("region", { name: "Tro ly AI" });
    expect(within(chatPanel).getByText("Hom nay toi nen chu y viec gi truoc?")).toBeInTheDocument();
    expect(
      within(chatPanel).queryByRole("button", {
        name: "Hom nay toi nen chu y viec gi truoc?",
      }),
    ).not.toBeInTheDocument();
    expect(aiApi.quickResponse).toHaveBeenCalledWith({
      action: "daily_priority",
      projectId: "63",
      taskId: null,
    });
  });

  it("shows a help response for unsupported task text", async () => {
    render(<AssistantBubble alertCount={1} projectId="63" />);

    fireEvent.click(await screen.findByRole("button", { name: "Mo tro ly AI" }));
    fireEvent.change(screen.getByPlaceholderText("Dat cau hoi cho tro ly AI..."), {
      target: { value: "task nao vay" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gui" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Neu ban muon kiem tra nhanh mot task cu the, hay ghi ro ma nhu TASK-104 de toi tra loi dung task.",
        ),
      ).toBeInTheDocument();
    });
  });
});
