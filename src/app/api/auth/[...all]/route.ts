import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

/**
 * Sign-up is closed.
 *
 * There is no self-registration in this app — an admin creates every account
 * on /admin/users, channel partners included. Better Auth mounts
 * `/sign-up/email` wherever email and password are enabled, though, so without
 * this it stays reachable by anyone who finds the URL, and a POST to it both
 * creates an account and replaces the caller's session cookie. The admin page
 * does not call it; nothing else should be able to either.
 *
 * The path is the endpoint's own — `/sign-up/email`, not `sign-up-email`. A
 * guess at the hyphenated spelling matches nothing and leaves sign-up open
 * while looking closed, so it is worth checking against the route table in
 * better-auth rather than from memory.
 *
 * The seed scripts are unaffected: they call `auth.api.signUpEmail` in process,
 * not over HTTP.
 */
export async function POST(request: Request) {
  if (new URL(request.url).pathname.endsWith("/sign-up/email")) {
    return new Response("Not Found", { status: 404 });
  }
  return handlers.POST(request);
}
