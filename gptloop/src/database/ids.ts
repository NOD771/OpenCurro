import crypto from "node:crypto";

/**
 * ID generation for the persistence layer.
 *
 * - Chat sessions use 20-character IDs.
 * - Sub-agent runs use 10-character IDs.
 *
 * Both alphabets use ALL the digits (0-9) and ALL the letters (a-z, A-Z), giving
 * 62^20 (~7e35) and 62^10 (~8e17) possible values respectively — collision-safe
 * for a local application while staying short, copyable, and URL-safe.
 */
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Chat sessions carry a 20-character alphanumeric ID. */
export const CHAT_SESSION_ID_LENGTH = 20;

/** Sub-agent runs carry a 10-character alphanumeric ID. */
export const SUB_AGENT_SESSION_ID_LENGTH = 10;

/** Generate a cryptographically random ID of `length` characters from the 62-char alphabet. */
export function randomId(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

/** Create a new 20-character chat session ID (all numbers + all letters). */
export function createChatSessionId(): string {
  return randomId(CHAT_SESSION_ID_LENGTH);
}

/** Create a new 10-character sub-agent session ID (all numbers + all letters). */
export function createSubAgentSessionId(): string {
  return randomId(SUB_AGENT_SESSION_ID_LENGTH);
}

/** True when `value` looks like a usable session id (bounded, printable, path-safe). */
export function isSafeSessionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[0-9A-Za-z_.-]+$/.test(value)
  );
}
