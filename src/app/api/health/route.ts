import { sql as rawSql } from "@/lib/db";

/**
 * Health check for the load balancer and for `systemctl` to point at.
 *
 * Deliberately two levels. `/api/health` answers 200 as soon as the Node
 * process is serving, which is what a load balancer or uptime monitor should
 * watch: if it also tested Postgres, then Neon suspending an idle branch —
 * which it does by design after a few idle minutes — would read as an outage
 * and could pull a perfectly healthy instance out of service.
 *
 * `/api/health?deep=1` does check the database, for a deploy script to call
 * once after a release and for monitoring to alert on.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.has("deep");

  if (!deep) {
    return Response.json({ status: "ok", uptime: Math.round(process.uptime()) });
  }

  try {
    const started = Date.now();
    await rawSql`select 1`;
    return Response.json({
      status: "ok",
      database: "ok",
      latencyMs: Date.now() - started,
    });
  } catch (err) {
    // The message can carry the connection string; log it, do not serve it.
    console.error("[health] database check failed:", err);
    return Response.json({ status: "error", database: "unreachable" }, { status: 503 });
  }
}
