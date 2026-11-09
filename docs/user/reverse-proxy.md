# Reverse proxy

Canopy ships no TLS and no proxy: put your own in front of the `web` container, keep
`CANOPY_HTTP_BIND=127.0.0.1` when the proxy runs on the same host, and open only the proxy's
port.

## Requirements

| Need                          | Why                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| HTTPS                         | Passwords and session cookies; set `CANOPY_PUBLIC_URL=https://…` so cookies are `Secure` |
| Request bodies of **≥ 40 MB** | Uploads go in 32 MB pieces (resumable); a smaller limit fails every upload over it       |
| No request buffering          | Pieces stream to the disk; buffering doubles the disk use and delays progress            |
| No response buffering         | Live progress uses Server-Sent Events (`/api/engine/…/events`); buffering freezes it     |
| Read timeout **≥ 15 min**     | Event streams stay open up to 10 minutes; large downloads take long                      |
| `Range` passed through        | Video seeking and resumed downloads                                                      |
| `X-Forwarded-For` / `-Proto`  | The real client IP for sign-in protection, the audit log and local-only actions          |

Then tell Canopy which proxies to trust, or every visitor looks like the proxy:

```env
# the proxy's address as seen by the web container, e.g. Docker's bridge networks
CANOPY_TRUSTED_PROXIES=172.16.0.0/12
```

Without it Canopy ignores `X-Forwarded-For` (the safe default) and sees every visitor as the
proxy. With it, the setup wizard and local-only actions (maintenance mode) use the address the
proxy reports, so open them from your LAN, not through the internet.

## Caddy

```caddyfile
files.example.com {
	request_body {
		max_size 64MB
	}
	reverse_proxy 127.0.0.1:3000 {
		flush_interval -1
		transport http {
			read_timeout 15m
		}
	}
}
```

Caddy sets `X-Forwarded-For` and `X-Forwarded-Proto` itself.

## Nginx

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name files.example.com;
    # ssl_certificate …; ssl_certificate_key …;

    client_max_body_size 64m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_read_timeout 15m;
        proxy_send_timeout 15m;
    }
}
```

## Traefik (labels on the `web` service)

```yaml
labels:
  - traefik.enable=true
  - traefik.http.routers.canopy.rule=Host(`files.example.com`)
  - traefik.http.routers.canopy.entrypoints=websecure
  - traefik.http.routers.canopy.tls.certresolver=letsencrypt
  - traefik.http.services.canopy.loadbalancer.server.port=3000
```

Traefik streams by default; raise the entrypoint's `respondingTimeouts.readTimeout` to `15m` and
leave any `buffering` middleware off this router. Join `web` to Traefik's network instead of
publishing a port.

## Cloudflare tunnel / proxy

Works the same way; Cloudflare's free plan limits request bodies to 100 MB, which fits the 32 MB
upload pieces. Canopy reads `CF-Connecting-IP` from trusted proxies.
