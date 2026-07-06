export interface ApiMeta {
  source: "mock" | "backend";
  latencyMs: number;
  generatedAt: string;
}

export interface ApiResponse<T> {
  data: T;
  meta: ApiMeta;
}
