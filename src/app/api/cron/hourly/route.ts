import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/server/cron";
import { runHourlyJobs } from "@/lib/server/jobs";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new NextResponse("Unauthorized", { status: 401 });
  const results = await runHourlyJobs();
  return NextResponse.json({ ok: true, results });
}
