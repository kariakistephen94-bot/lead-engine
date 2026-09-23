/**
 * Runs once when a server instance boots.
 *
 * Starts the X lead engine's scheduler inside the web process when
 * X_AUTORUN=true, so searches keep running with nothing else deployed. The
 * import is dynamic and Node-only: the service reaches Postgres, which the
 * edge runtime cannot load.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!/^(1|true|yes|on)$/i.test(process.env.X_AUTORUN?.trim() ?? "")) return;
  const { startXAutorun } = await import("@/lib/services/x-leads");
  startXAutorun();
}
