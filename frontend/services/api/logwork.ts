import { LogworkEntry, LogworkFilters, UserProfile } from "@/types";
import { filterLogwork, respond } from "./core";
import { logworkEntries } from "@/lib/mock/data";

export const logworkApi = {
  async list(filters?: LogworkFilters, viewer?: UserProfile | null) {
    return respond(filterLogwork(filters, viewer), 100);
  },

  async create(payload: Omit<LogworkEntry, "id">) {
    const created: LogworkEntry = {
      ...payload,
      id: `log-${logworkEntries.length + 1}`,
    };
    logworkEntries.unshift(created);
    return respond(created, 150);
  },

  async update(entryId: string, payload: Partial<LogworkEntry>) {
    const index = logworkEntries.findIndex((entry) => entry.id === entryId);
    const updated = { ...logworkEntries[index], ...payload };
    logworkEntries[index] = updated;
    return respond(updated, 140);
  },

  async remove(entryId: string) {
    const index = logworkEntries.findIndex((entry) => entry.id === entryId);
    const removed = logworkEntries[index];
    logworkEntries.splice(index, 1);
    return respond(removed, 130);
  },
};
