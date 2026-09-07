const UUID_BYTES = 16;

/**
 * A version 4 UUID, for the Idempotency-Key header the contract types as a uuid.
 *
 * crypto.randomUUID is deliberately not used: it is exposed only in a secure context, and
 * the development VM serves plain HTTP (ARCHITECTURE R1), so it is absent exactly where the
 * form has to work. crypto.getRandomValues is available in every context.
 */
export function randomUuidV4(): string {
  const bytes = new Uint8Array(UUID_BYTES);
  crypto.getRandomValues(bytes);

  // RFC 9562 section 5.4: the four version bits are 0100, the two variant bits are 10.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
