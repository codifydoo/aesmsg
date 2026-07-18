// Internal, adapter-controlled header carrying Fastify's resolved `request.ip` (post-`trustProxy`).
// The Web-standard message handlers can't see Fastify's `request` object, so `fastify-adapter.ts`
// SETS this header from `request.ip` and STRIPS any inbound copy a client tried to send. It is the
// SINGLE trusted source of the client identity the rate limiter keys on.
//
// Handlers must read the client IP ONLY via `getClientIp` below — never from raw `x-forwarded-for`
// / `x-real-ip`, which a client can spoof (BE-2 / R3). Trust is decided once, at the Fastify edge,
// by the scoped `trustProxy` setting (see `lib/trust-proxy.ts`).
export const CLIENT_IP_HEADER = "x-aesmsg-client-ip";

export function getClientIp(request: Request): string {
  return request.headers.get(CLIENT_IP_HEADER) ?? "unknown";
}
