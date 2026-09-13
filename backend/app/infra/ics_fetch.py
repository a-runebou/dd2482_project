import ipaddress
import socket
from urllib.parse import urlparse

import httpx


class IcsFetchError(RuntimeError):
    pass


def _normalise_url(url: str) -> str:
    if url.startswith("webcal://"):
        return "https://" + url[len("webcal://") :]

    return url


def _validate_host(url: str) -> None:
    parsed = urlparse(url)

    if parsed.scheme not in {
        "http",
        "https",
    }:
        raise IcsFetchError("Unsupported calendar URL scheme")

    if parsed.hostname is None:
        raise IcsFetchError("Calendar URL has no hostname")

    try:
        addresses = socket.getaddrinfo(
            parsed.hostname,
            parsed.port or (443 if parsed.scheme == "https" else 80),
        )
    except OSError as exc:
        raise IcsFetchError("Calendar host could not be resolved") from exc

    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])

        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            raise IcsFetchError("Calendar URL resolves to a forbidden address")


def fetch_ics(
    url: str,
    *,
    max_bytes: int,
    etag: str | None,
) -> tuple[bytes | None, str | None]:
    url = _normalise_url(url)

    _validate_host(url)

    headers: dict[str, str] = {}

    if etag is not None:
        headers["If-None-Match"] = etag

    try:
        with httpx.Client(
            timeout=10.0,
            follow_redirects=False,
        ) as client:
            response = client.get(
                url,
                headers=headers,
            )
    except httpx.HTTPError as exc:
        raise IcsFetchError("Calendar could not be fetched") from exc

    if response.status_code == 304:
        return None, etag

    if response.status_code != 200:
        raise IcsFetchError(f"Calendar returned HTTP {response.status_code}")

    content = response.content

    if len(content) > max_bytes:
        raise IcsFetchError("Calendar exceeds maximum size")

    return (
        content,
        response.headers.get("ETag"),
    )
