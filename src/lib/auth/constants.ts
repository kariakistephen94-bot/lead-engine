/**
 * Deliberately dependency-free.
 *
 * The middleware runs on the edge and imports this. Anything reaching the
 * database or `server-only` from here would drag `pg` into the edge bundle and
 * fail the build, so this file must stay a plain constant.
 */
export const SESSION_COOKIE = "lead_engine_session";
