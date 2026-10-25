"""Outbound URL guard for user-configured targets (webhooks).

Rejects URLs that resolve to loopback, private, link-local or otherwise
non-public addresses so the backend cannot be used to reach internal
services (MongoDB, cloud metadata, the Docker network).
"""

import asyncio
import ipaddress
import socket
from urllib.parse import urlparse


async def _resolve(host: str) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    loop = asyncio.get_running_loop()
    infos = await loop.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    return [ipaddress.ip_address(info[4][0]) for info in infos]


async def is_public_http_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    try:
        addresses = await _resolve(parsed.hostname)
    except (socket.gaierror, UnicodeError, ValueError):
        return False
    return bool(addresses) and all(addr.is_global for addr in addresses)
