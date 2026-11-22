---
name: tailscale-serve-sidecar
description: Configure a Tailscale serve sidecar container in Docker Compose to expose services over your tailnet with HTTPS, funnel, or TCP/UDP proxying. Use when setting up Tailscale as a reverse proxy sidecar, exposing Docker services to a tailnet, configuring Tailscale Serve or Funnel in containers, or adding tailnet connectivity to existing compose stacks.
---

# Tailscale Serve Sidecar for Docker Compose

## Overview

This skill guides you through configuring a Tailscale container as a sidecar in Docker Compose. The Tailscale sidecar acts as a reverse proxy that joins your tailnet and exposes a companion service via Tailscale Serve (HTTPS on your tailnet) or Tailscale Funnel (public internet access). This eliminates the need to install Tailscale directly in your application container.

## When to Use This Skill

Invoke this skill when:
- Exposing a Docker service to a Tailscale tailnet
- Adding HTTPS termination to a containerized service via Tailscale Serve
- Making a Docker service publicly accessible via Tailscale Funnel
- Setting up a sidecar proxy pattern with Tailscale in Docker Compose
- Proxying TCP or UDP traffic through Tailscale to a container

## Architecture

```
Internet/Tailnet → Tailscale Sidecar Container → App Container
                   (tailscale serve)              (your service)
```

The Tailscale sidecar:
1. Joins your tailnet as a node
2. Runs `tailscale serve` to proxy traffic to the app container
3. Handles TLS termination automatically (MagicDNS HTTPS certs)
4. Optionally enables Funnel for public internet access

The app container uses the Tailscale sidecar's network stack (`network_mode: service:tailscale-<name>`) so that traffic flows through Tailscale.

## Prerequisites

- A Tailscale account
- A Tailscale auth key (generate at https://login.tailscale.com/admin/settings/keys)
  - Use a **reusable** auth key for development
  - Use an **ephemeral** auth key for production (node auto-removed when container stops)
  - Optionally **pre-approve** the key to skip admin approval
  - Tag the key if using ACL tag-based policies (e.g., `tag:container`)

## Basic Setup

### Minimal Example — Expose a web app on your tailnet

This is the simplest setup. It exposes an app container on your tailnet with automatic HTTPS.

```yaml
services:
  tailscale-myapp:
    image: tailscale/tailscale:latest
    hostname: myapp                          # Node name on your tailnet
    environment:
      - TS_AUTHKEY=${TS_AUTHKEY}             # Auth key from Tailscale admin
      - TS_STATE_DIR=/var/lib/tailscale      # Persist state across restarts
      - TS_SERVE_CONFIG=/config/serve.json   # Serve configuration
    volumes:
      - tailscale-myapp-state:/var/lib/tailscale   # State persistence
      - ./tailscale/myapp-serve.json:/config/serve.json  # Serve config
    cap_add:
      - NET_ADMIN                            # Required for tailscale networking
      - SYS_MODULE                           # Required for tun device
    restart: unless-stopped

  myapp:
    image: myapp:latest
    network_mode: service:tailscale-myapp    # Share tailscale's network
    # Do NOT publish ports — traffic flows through tailscale
    restart: unless-stopped

volumes:
  tailscale-myapp-state:
```

### Serve Configuration File

Create `tailscale/myapp-serve.json`:

```json
{
  "TCP": {
    "443": {
      "HTTPS": true
    }
  },
  "Web": {
    "${TS_CERT_DOMAIN}:443": {
      "Handlers": {
        "/": {
          "Proxy": "http://127.0.0.1:8080"
        }
      }
    }
  }
}
```

Key points:
- `${TS_CERT_DOMAIN}` is automatically expanded by Tailscale to the node's full MagicDNS name (e.g., `myapp.tailnet-name.ts.net`)
- The `Proxy` target uses `127.0.0.1` because the app container shares the Tailscale container's network namespace
- Port in the proxy URL must match the port your app listens on inside the container

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `TS_AUTHKEY` | Yes | Tailscale auth key for node registration |
| `TS_STATE_DIR` | Recommended | Directory to persist Tailscale state (mount as volume) |
| `TS_SERVE_CONFIG` | For Serve | Path to serve config JSON inside the container |
| `TS_HOSTNAME` | No | Override hostname (alternative to `hostname:` in compose) |
| `TS_EXTRA_ARGS` | No | Additional `tailscale up` arguments (e.g., `--advertise-tags=tag:container`) |
| `TS_USERSPACE` | No | Set to `true` to use userspace networking (no `NET_ADMIN` needed, but slower) |
| `TS_ACCEPT_DNS` | No | Set to `false` to not use Tailscale DNS inside the container |
| `TS_OUTBOUND_HTTP_PROXY_LISTEN` | No | Listen address for outbound HTTP proxy |

## Common Patterns

### Pattern: Expose with Funnel (public internet access)

To make your service accessible from the public internet (not just your tailnet), enable Funnel in the serve config.

**Requirements:**
- Funnel must be enabled in your tailnet's ACL policy
- The node must have Funnel enabled in ACLs
- HTTPS must be enabled on the tailnet

`tailscale/myapp-serve.json`:
```json
{
  "AllowFunnel": {
    "${TS_CERT_DOMAIN}:443": true
  },
  "TCP": {
    "443": {
      "HTTPS": true
    }
  },
  "Web": {
    "${TS_CERT_DOMAIN}:443": {
      "Handlers": {
        "/": {
          "Proxy": "http://127.0.0.1:8080"
        }
      }
    }
  }
}
```

### Pattern: Multiple Path Handlers

Route different URL paths to different backend ports or services:

```json
{
  "TCP": {
    "443": {
      "HTTPS": true
    }
  },
  "Web": {
    "${TS_CERT_DOMAIN}:443": {
      "Handlers": {
        "/": {
          "Proxy": "http://127.0.0.1:3000"
        },
        "/api/": {
          "Proxy": "http://127.0.0.1:8080"
        },
        "/static/": {
          "Path": "/var/www/static"
        }
      }
    }
  }
}
```

### Pattern: TCP Proxy (non-HTTP services)

For non-HTTP services like databases, use TCP proxying:

```json
{
  "TCP": {
    "5432": {
      "TCPForward": "127.0.0.1:5432"
    }
  }
}
```

This exposes a PostgreSQL database on your tailnet at `myapp.tailnet-name.ts.net:5432`.

### Pattern: Multiple Services with Separate Tailscale Sidecars

Each service gets its own Tailscale node and hostname:

```yaml
services:
  tailscale-frontend:
    image: tailscale/tailscale:latest
    hostname: frontend
    environment:
      - TS_AUTHKEY=${TS_AUTHKEY}
      - TS_STATE_DIR=/var/lib/tailscale
      - TS_SERVE_CONFIG=/config/serve.json
    volumes:
      - ts-frontend-state:/var/lib/tailscale
      - ./tailscale/frontend-serve.json:/config/serve.json
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    restart: unless-stopped

  frontend:
    image: frontend:latest
    network_mode: service:tailscale-frontend
    restart: unless-stopped

  tailscale-api:
    image: tailscale/tailscale:latest
    hostname: api
    environment:
      - TS_AUTHKEY=${TS_AUTHKEY}
      - TS_STATE_DIR=/var/lib/tailscale
      - TS_SERVE_CONFIG=/config/serve.json
    volumes:
      - ts-api-state:/var/lib/tailscale
      - ./tailscale/api-serve.json:/config/serve.json
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    restart: unless-stopped

  api:
    image: api:latest
    network_mode: service:tailscale-api
    restart: unless-stopped

volumes:
  ts-frontend-state:
  ts-api-state:
```

### Pattern: Userspace Networking (no NET_ADMIN)

If you cannot grant `NET_ADMIN` (e.g., restricted environments), use userspace networking. This is slower but requires fewer privileges:

```yaml
services:
  tailscale-myapp:
    image: tailscale/tailscale:latest
    hostname: myapp
    environment:
      - TS_AUTHKEY=${TS_AUTHKEY}
      - TS_STATE_DIR=/var/lib/tailscale
      - TS_SERVE_CONFIG=/config/serve.json
      - TS_USERSPACE=true
    volumes:
      - tailscale-myapp-state:/var/lib/tailscale
      - ./tailscale/myapp-serve.json:/config/serve.json
    restart: unless-stopped

  myapp:
    image: myapp:latest
    network_mode: service:tailscale-myapp
    restart: unless-stopped

volumes:
  tailscale-myapp-state:
```

### Pattern: Sidecar with Existing Compose Networks

If your app container needs to reach other containers on a Docker network (e.g., a database), the Tailscale sidecar must join those networks since the app uses `network_mode: service:tailscale-*`:

```yaml
services:
  tailscale-myapp:
    image: tailscale/tailscale:latest
    hostname: myapp
    environment:
      - TS_AUTHKEY=${TS_AUTHKEY}
      - TS_STATE_DIR=/var/lib/tailscale
      - TS_SERVE_CONFIG=/config/serve.json
    volumes:
      - tailscale-myapp-state:/var/lib/tailscale
      - ./tailscale/myapp-serve.json:/config/serve.json
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    networks:
      - backend                              # Sidecar joins the network
    restart: unless-stopped

  myapp:
    image: myapp:latest
    network_mode: service:tailscale-myapp    # Inherits sidecar's networks
    depends_on:
      - tailscale-myapp
      - db
    restart: unless-stopped

  db:
    image: postgres:16
    networks:
      - backend
    environment:
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - db-data:/var/lib/postgresql/data

networks:
  backend:

volumes:
  tailscale-myapp-state:
  db-data:
```

## Auth Key Management

### Using .env File (Recommended for Development)

Create a `.env` file (add to `.gitignore`):
```
TS_AUTHKEY=tskey-auth-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Using Docker Secrets (Recommended for Production)

```yaml
services:
  tailscale-myapp:
    image: tailscale/tailscale:latest
    hostname: myapp
    environment:
      - TS_AUTHKEY_FILE=/run/secrets/ts_authkey
      - TS_STATE_DIR=/var/lib/tailscale
      - TS_SERVE_CONFIG=/config/serve.json
    secrets:
      - ts_authkey
    volumes:
      - tailscale-myapp-state:/var/lib/tailscale
      - ./tailscale/myapp-serve.json:/config/serve.json
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    restart: unless-stopped

secrets:
  ts_authkey:
    file: ./secrets/ts_authkey.txt    # Or use external secret management

volumes:
  tailscale-myapp-state:
```

### Auth Key Types

| Key Type | Use Case |
|---|---|
| Reusable | Development, testing — node persists after container stops |
| Ephemeral | Production — node auto-removed from tailnet when container stops |
| Pre-approved | Skip admin approval for new nodes |
| Tagged (`tag:xxx`) | ACL policy enforcement — use for production |

## Troubleshooting

### Container won't join tailnet
- Verify `TS_AUTHKEY` is set and not expired
- Check container logs: `docker compose logs tailscale-myapp`
- Ensure `NET_ADMIN` and `SYS_MODULE` capabilities are granted (or use `TS_USERSPACE=true`)
- Verify the auth key hasn't exceeded its usage limit

### Serve not working / 502 errors
- Confirm the app container is running and listening on the expected port
- The proxy target must use `127.0.0.1` (not `localhost` or the container name) because they share a network namespace
- Verify the serve config JSON is valid: `cat tailscale/myapp-serve.json | jq .`
- Check that the serve config file is mounted correctly

### App container can't reach other containers
- When using `network_mode: service:tailscale-*`, the app inherits the sidecar's network
- The **sidecar** must be connected to any Docker networks the app needs
- DNS resolution for other container names works through the sidecar's network connections

### State persistence issues
- Always mount `TS_STATE_DIR` as a named volume
- Without state persistence, the container registers a new node on every restart, consuming auth key uses
- If state gets corrupted, delete the volume and re-register: `docker volume rm <volume-name>`

### Funnel not working
- Funnel must be enabled in your tailnet ACL policy under `nodeAttrs`
- The node must match the Funnel ACL rules (check tags)
- Only ports 443, 8443, and 10000 are supported for Funnel
- DNS propagation may take a few minutes after first enabling

### Port conflicts
- Do NOT use `ports:` on the app container when using `network_mode: service:tailscale-*`
- If you need to expose ports on the host for local development alongside Tailscale, add `ports:` to the **tailscale sidecar** container instead

## Best Practices

1. **Use ephemeral + tagged auth keys in production** — nodes auto-clean from the tailnet and ACLs control access
2. **Always persist state** — mount `TS_STATE_DIR` as a named Docker volume to avoid re-registration on restarts
3. **Never commit auth keys** — use `.env` files (gitignored) or Docker secrets
4. **Pin the Tailscale image tag** — use `tailscale/tailscale:v1.78.1` instead of `latest` for reproducibility
5. **Use `depends_on`** — ensure the Tailscale sidecar starts before the app container
6. **Add networks to the sidecar** — if your app needs to reach other containers, the sidecar must join those networks
7. **Use `TS_EXTRA_ARGS` for tags** — e.g., `TS_EXTRA_ARGS=--advertise-tags=tag:container` for ACL enforcement
8. **Monitor with `docker compose exec`** — run `docker compose exec tailscale-myapp tailscale status` to check connectivity
