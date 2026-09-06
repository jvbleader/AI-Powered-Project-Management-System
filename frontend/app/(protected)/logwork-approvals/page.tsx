import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function LogworkApprovalsRedirect({
  searchParams,
}: {
  searchParams: Promise<SearchParams> | SearchParams;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) {
      query.set(key, value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (item) query.append(key, item);
      }
    }
  }

  const suffix = query.toString();
  redirect(suffix ? `/logwork?${suffix}` : "/logwork");
}
