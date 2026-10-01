import { listCandidates } from "@/lib/candidates";

export async function GET() {
  return Response.json(listCandidates());
}
