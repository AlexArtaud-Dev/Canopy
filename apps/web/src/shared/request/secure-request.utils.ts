/**
 * Whether a request reached Canopy over HTTPS, which decides if its cookies may be `Secure`
 * (browsers drop Secure and `__Secure-` cookies on plain-HTTP pages).
 *
 * A reverse proxy says so in `X-Forwarded-Proto`. Without one, a request is HTTPS only when it
 * came to the public address and that address is HTTPS. A direct LAN visit such as
 * `http://192.168.1.10:6060` is plain HTTP, so signing in there works (maintenance mode lets only
 * the local network in). A forged header only weakens or breaks the sender's own cookies.
 */
export function isSecureRequest(
  forwardedProto: string | null,
  host: string | null,
  publicUrl: string,
): boolean {
  const proto = forwardedProto?.split(',')[0]?.trim().toLowerCase();
  if (proto) return proto === 'https';
  const url = new URL(publicUrl);
  return url.protocol === 'https:' && host?.toLowerCase() === url.host.toLowerCase();
}
