/* ---------------------------------------------------------
   Biometric app-lock for the web / PWA (soft lock).

   Uses WebAuthn with the device's platform authenticator
   (fingerprint / Face ID / Windows Hello). This gates opening
   the app on the phone's biometric — it does NOT replace the
   Supabase login. It's a privacy/convenience lock: the saved
   session still lives in the browser, so a determined person
   could open the same URL in a plain browser and skip it.
   For the installed Expo app the lock is enforced natively.
--------------------------------------------------------- */

const CRED_KEY = "bp_lock_cred";      // stored credential id (base64url)
const UNLOCK_KEY = "bp_unlocked";     // per-session unlock flag

const b64url = {
  encode(buf) {
    const bytes = new Uint8Array(buf);
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(str) {
    const s = str.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  },
};

const randomBytes = (n) => {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
};

// Is biometric even possible on this device/browser?
export async function isBiometricSupported() {
  try {
    if (!window.PublicKeyCredential) return false;
    if (!window.isSecureContext) return false; // needs https (Vercel is)
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function isLockEnabled() {
  return !!localStorage.getItem(CRED_KEY);
}

export function isUnlocked() {
  return sessionStorage.getItem(UNLOCK_KEY) === "1";
}

export function markUnlocked() {
  sessionStorage.setItem(UNLOCK_KEY, "1");
}

export function lockNow() {
  sessionStorage.removeItem(UNLOCK_KEY);
}

// Register this device's biometric and turn the lock on.
export async function enableLock(email = "staff") {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: "Bypass Shop", id: location.hostname },
      user: { id: randomBytes(16), name: email, displayName: email },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },   // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60000,
      attestation: "none",
    },
  });
  if (!cred) throw new Error("Biometric setup was cancelled.");
  localStorage.setItem(CRED_KEY, b64url.encode(cred.rawId));
  markUnlocked();
  return true;
}

export function disableLock() {
  localStorage.removeItem(CRED_KEY);
  lockNow();
}

// Prompt the device biometric to unlock. Resolves true on success.
export async function unlock() {
  const id = localStorage.getItem(CRED_KEY);
  if (!id) return true; // no lock set → nothing to unlock
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: "public-key", id: b64url.decode(id) }],
      userVerification: "required",
      timeout: 60000,
    },
  });
  if (!assertion) throw new Error("Unlock failed.");
  markUnlocked();
  return true;
}
