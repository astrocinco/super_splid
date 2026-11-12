// Verificación del ID token de Google y sesiones firmadas con HMAC (sin dependencias).

const enc = new TextEncoder();
const b64u = {
  enc: (buf: ArrayBuffer | Uint8Array) =>
    btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: (s: string) => {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  },
};

export interface GoogleClaims { email: string; name: string; picture?: string }

let jwksCache: { keys: (JsonWebKey & { kid: string })[]; at: number } | null = null;

async function getJwks() {
  if (jwksCache && Date.now() - jwksCache.at < 3600_000) return jwksCache.keys;
  const r = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!r.ok) throw new Error("No se pudieron obtener las claves de Google");
  const { keys } = (await r.json()) as { keys: (JsonWebKey & { kid: string })[] };
  jwksCache = { keys, at: Date.now() };
  return keys;
}

export async function verifyGoogleIdToken(token: string, clientId: string): Promise<GoogleClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Token inválido");
  const header = JSON.parse(new TextDecoder().decode(b64u.dec(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(b64u.dec(parts[1])));
  if (header.alg !== "RS256") throw new Error("Algoritmo no soportado");

  const jwk = (await getJwks()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("Clave desconocida");
  const key = await crypto.subtle.importKey(
    "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", key, b64u.dec(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error("Firma inválida");

  const now = Math.floor(Date.now() / 1000);
  if (!["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)) throw new Error("Emisor inválido");
  if (payload.aud !== clientId) throw new Error("Audiencia inválida");
  if (payload.exp < now) throw new Error("Token expirado");
  if (!payload.email_verified) throw new Error("Email no verificado");
  return { email: String(payload.email).toLowerCase(), name: payload.name ?? payload.email, picture: payload.picture };
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export const SESSION_DAYS = 30;

export async function createSession(userId: number, secret: string): Promise<string> {
  const body = b64u.enc(enc.encode(JSON.stringify({ uid: userId, exp: Date.now() + SESSION_DAYS * 86400_000 })));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return `${body}.${b64u.enc(sig)}`;
}

export async function readSession(token: string | undefined, secret: string): Promise<number | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), b64u.dec(sig), enc.encode(body));
  if (!ok) return null;
  const { uid, exp } = JSON.parse(new TextDecoder().decode(b64u.dec(body)));
  return exp > Date.now() ? (uid as number) : null;
}
