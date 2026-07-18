import type { FastifyReply, FastifyRequest } from "fastify";
import { CLIENT_IP_HEADER } from "./lib/client-ip";

// The relocated handlers are written against the Web-standard Request/Response. This adapter builds
// a Request from the incoming Fastify request, stamps the trusted client IP onto it, invokes the
// handler, and writes the Response back to the Fastify reply.
type WebHandler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

export async function runHandler(
  handler: WebHandler,
  request: FastifyRequest,
  reply: FastifyReply,
  params: { id?: string } = {},
): Promise<void> {
  const url = new URL(request.url, `${request.protocol}://${request.hostname}`).toString();

  // Skip runtime-managed / hop-by-hop headers — constructing a Request with them is fragile — plus
  // any inbound copy of the trusted client-IP header (stripped so a client can't forge it below).
  // The handlers read content-type and the resolved client IP (from CLIENT_IP_HEADER) only.
  const SKIP = new Set([
    "host",
    "content-length",
    "connection",
    "transfer-encoding",
    CLIENT_IP_HEADER,
  ]);
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined || SKIP.has(key.toLowerCase())) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.append(key, value);
    }
  }

  // Stamp Fastify's resolved client IP (post-trustProxy) as the SINGLE trusted identity the handlers
  // key the rate limiter on. Because `trustProxy` is scoped (see server.ts), `request.ip` is the
  // socket address by default and only reflects X-Forwarded-For when the operator opted into proxy
  // trust — so a forged XFF cannot rotate the limiter key. `set` (after the SKIP above) guarantees a
  // single, non-spoofable value.
  headers.set(CLIENT_IP_HEADER, request.ip || "unknown");

  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const webRequest = new Request(url, {
    method,
    headers,
    ...(hasBody ? { body: (request.body as string | undefined) ?? "" } : {}),
  });

  const context = { params: Promise.resolve({ id: params.id ?? "" }) };
  const res = await handler(webRequest, context);

  reply.status(res.status);
  res.headers.forEach((headerValue, headerKey) => {
    reply.header(headerKey, headerValue);
  });
  reply.send(await res.text());
}
