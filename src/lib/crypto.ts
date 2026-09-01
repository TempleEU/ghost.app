/**
 * GhostChat client-side E2E encryption (v1).
 *
 * Protocol: ECDH P-256 key agreement + HKDF-SHA256 -> AES-256-GCM.
 * Every user has a P-256 keypair. The private key is wrapped with a key
 * derived from a passphrase (PBKDF2) and stored in localStorage.
 * Conversation keys are 256-bit random values, wrapped per-member using
 * an ECDH-derived KEK. The server never sees plaintext or unwrapped keys.
 */

const EC = "P-256";
const AES = "AES-GCM";
const DERIVED_BITS = 256;

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}

/** Random bytes backed by a plain ArrayBuffer (TS 5.9 BufferSource-friendly). */
function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(n);
  crypto.getRandomValues(new Uint8Array(buf));
  return new Uint8Array(buf);
}

function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ----------------------------------------------------------- identity keys

export async function generateIdentity(): Promise<{
  publicKeyJwk: string;
  privateKeyJwk: string;
}> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: EC },
    true,
    ["deriveKey", "deriveBits"],
  );
  const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const priv = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return {
    publicKeyJwk: JSON.stringify(pub),
    privateKeyJwk: JSON.stringify(priv),
  };
}

async function deriveSharedBits(
  myPrivateJwk: string,
  peerPublicJwk: string,
): Promise<ArrayBuffer> {
  const priv = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(myPrivateJwk),
    { name: "ECDH", namedCurve: EC },
    true,
    ["deriveBits"],
  );
  const peer = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(peerPublicJwk),
    { name: "ECDH", namedCurve: EC },
    true,
    [],
  );
  return crypto.subtle.deriveBits(
    { name: "ECDH", public: peer },
    priv,
    DERIVED_BITS,
  );
}

async function kekFromBits(bits: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bits, AES, false, ["encrypt", "decrypt"]);
}

/** Wrap the raw conversation key for a specific member (ECDH-derived KEK). */
export async function wrapConversationKey(
  rawKey: ArrayBuffer,
  myPrivateJwk: string,
  peerPublicJwk: string,
): Promise<{ iv: string; wrappedKey: string }> {
  const bits = await deriveSharedBits(myPrivateJwk, peerPublicJwk);
  const kek = await kekFromBits(bits);
  const iv = randomBytes(12);
  const wrapped = await crypto.subtle.encrypt({ name: AES, iv }, kek, rawKey);
  return { iv: b64(iv), wrappedKey: b64(wrapped) };
}

/** Unwrap the conversation key addressed to me. */
export async function unwrapConversationKey(
  myPrivateJwk: string,
  peerPublicJwk: string,
  ivB64: string,
  wrappedB64: string,
): Promise<CryptoKey> {
  const bits = await deriveSharedBits(myPrivateJwk, peerPublicJwk);
  const kek = await kekFromBits(bits);
  const raw = await crypto.subtle.decrypt(
    { name: AES, iv: unb64(ivB64) },
    kek,
    unb64(wrappedB64),
  );
  return crypto.subtle.importKey("raw", raw, { name: AES }, false, [
    "encrypt",
    "decrypt",
  ]);
}

// ----------------------------------------------------------- private key at rest

async function passphraseKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310_000, hash: "SHA-256" },
    base,
    { name: AES, length: DERIVED_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

const STORE_KEY = "ghostchat.identity.v1";

export async function saveIdentity(
  passphrase: string,
  identity: { privateKeyJwk: string },
): Promise<void> {
  const salt = randomBytes(16);
  const kek = await passphraseKey(passphrase, salt);
  const iv = randomBytes(12);
  const wrapped = await crypto.subtle.encrypt(
    { name: AES, iv },
    kek,
    new TextEncoder().encode(identity.privateKeyJwk),
  );
  localStorage.setItem(
    STORE_KEY,
    JSON.stringify({
      salt: b64(salt),
      iv: b64(iv),
      wrapped: b64(wrapped),
      check: "ghostchat-v1",
    }),
  );
}

/** Returns the unwrapped private key JWK, or null if the passphrase is wrong. */
export async function loadIdentity(passphrase: string): Promise<string | null> {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      salt: string;
      iv: string;
      wrapped: string;
    };
    const kek = await passphraseKey(passphrase, unb64(parsed.salt));
    const plain = await crypto.subtle.decrypt(
      { name: AES, iv: unb64(parsed.iv) },
      kek,
      unb64(parsed.wrapped),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export function hasStoredIdentity(): boolean {
  return localStorage.getItem(STORE_KEY) !== null;
}

// ----------------------------------------------------------- key verification

/**
 * Short human-readable fingerprint of a public key (for "Verify keys").
 * Two members compare these out-of-band; equal fingerprints mean nobody
 * swapped the keys in transit (no MITM).
 */
export async function publicKeyFingerprint(publicKeyJwk: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(publicKeyJwk),
  );
  return Array.from(new Uint8Array(digest.slice(0, 8)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("-")
    .toUpperCase();
}

// ----------------------------------------------------------- message crypto

/** Generate a fresh 256-bit conversation key. */
export function generateConversationKey(): ArrayBuffer {
  return crypto.getRandomValues(new Uint8Array(32)).buffer;
}

/** Import raw conversation-key bytes for AES-GCM use. */
export async function importConversationKey(
  raw: ArrayBuffer,
): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: AES }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptMessage(
  key: CryptoKey,
  plaintext: string,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = randomBytes(12);
  const buf = await crypto.subtle.encrypt(
    { name: AES, iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext: b64(buf), iv: b64(iv) };
}

export async function decryptMessage(
  key: CryptoKey,
  ciphertextB64: string,
  ivB64: string,
): Promise<string> {
  const buf = await crypto.subtle.decrypt(
    { name: AES, iv: unb64(ivB64) },
    key,
    unb64(ciphertextB64),
  );
  return new TextDecoder().decode(buf);
}
