"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, GoogleAuthProvider, signOut, deleteUser, getAdditionalUserInfo, type User } from "firebase/auth";
import { doc, setDoc, onSnapshot, getDoc } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";

export type Role = "buyer" | "seller" | null;

type AuthCtx = {
  user: User | null;
  role: Role;
  isAdmin: boolean;
  loading: boolean;
  unconfigured: boolean;
  signIn: (role: Role) => Promise<void>;
  signInSellerGoogle: () => Promise<void>;
  signInEmail: (role: Role, email: string, password: string, mode: "signin" | "signup") => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOutNow: () => Promise<void>;
  setRole: (role: Role) => Promise<void>;
  /** Email a password-reset link (spec §46). Never reveals whether the address exists. */
  resetPassword: (email: string) => Promise<void>;
  /** Re-send the verification email to the signed-in user (spec §46). */
  resendVerification: () => Promise<void>;
  /**
   * Whether the signed-in user's email is verified. Tracked as its own state
   * rather than read from `user.emailVerified` at render time: `reload()`
   * mutates the cached User object in place, so `setUser(user)` would be
   * reference-equal and React would skip the re-render, leaving a stale `false`.
   */
  emailVerified: boolean;
  /** Re-read the auth record (e.g. after the user clicks the verification link). */
  refreshUser: () => Promise<void>;
};
const Ctx = createContext<AuthCtx>({
  user: null, role: null, isAdmin: false, loading: false, unconfigured: true,
  signIn: async () => {}, signInSellerGoogle: async () => {}, signInEmail: async () => {}, signInGoogle: async () => {}, signOutNow: async () => {}, setRole: async () => {},
  resetPassword: async () => {}, resendVerification: async () => {}, emailVerified: false, refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRoleState] = useState<Role>(null);
  const [adminUid, setAdminUid] = useState<string | null>(null);
  // Start non-loading when Firebase is absent; avoids setState-in-effect.
  const [loading, setLoading] = useState(() => Boolean(auth && isFirebaseConfigured));
  const [emailVerified, setEmailVerified] = useState(false);

  // Auth state
  useEffect(() => {
    if (!auth || !isFirebaseConfigured) return;
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      setEmailVerified(Boolean(u?.emailVerified));
      if (!u) {
        setRoleState(null);
        setAdminUid(null);
      }
    });
  }, []);

  // Realtime role listener: users/{uid}.role updates instantly (e.g. after signup).
  // The uid is lifted out of the effect so the dependency array is a stable
  // primitive — depending on the whole `user` object would re-subscribe on every
  // auth-state render that produces a fresh User instance.
  const uid = user?.uid ?? null;
  useEffect(() => {
    // Sign-out role reset happens in onAuthStateChanged above — doing it here as
    // well would be a synchronous setState in an effect (cascading render).
    if (!db || !uid) return;
    return onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as { role?: string };
          setRoleState(data.role === "seller" ? "seller" : data.role === "buyer" ? "buyer" : null);
        } else {
          setRoleState(null);
        }
      },
      (err) => { console.warn("[KASI] role listener failed (check Firestore rules):", err.message); }
    );
  }, [uid]);

  useEffect(() => {
    if (!db || !uid) return;
    return onSnapshot(
      doc(db, "admins", uid),
      (snap) => setAdminUid(snap.exists() ? uid : null),
      (err) => {
        setAdminUid(null);
        console.warn("[KASI] admin registry listener failed:", err.message);
      },
    );
  }, [uid]);

  const saveSelectedRole = async (
    targetUser: User,
    selectedRole: Exclude<Role, null>,
    profile: { email: string | null; name: string | null }
  ) => {
    if (!db) throw new Error("Firebase is not configured.");
    const userRef = doc(db, "users", targetUser.uid);
    const existing = await getDoc(userRef);
    if (existing.exists() && existing.data().role === "seller" && selectedRole !== "seller") {
      setRoleState("seller");
      throw new Error("This account is registered as a seller. Choose Seller to sign in.");
    }
    await setDoc(userRef, {
      role: selectedRole,
      email: profile.email,
      name: profile.name,
      createdAt: new Date().toISOString(),
    }, { merge: true });
    setRoleState(selectedRole);
  };

  /** Sign in with Google, then persist role to users/{uid} (buyer or seller). */
  const signIn = async (r: Role) => {
    if (!auth || !db) throw new Error("Firebase not configured — add NEXT_PUBLIC_FIREBASE_* to .env.local and restart.");
    const cred = await signInWithPopup(auth, new GoogleAuthProvider());
    if (r && cred.user) {
      await saveSelectedRole(cred.user, r, {
        email: cred.user.email ?? null,
        name: cred.user.displayName ?? null,
      });
    }
  };

  /** Google is a seller login method only; it must never create or promote a seller. */
  const signInSellerGoogle = async () => {
    if (!auth || !db) throw new Error("Firebase not configured — add NEXT_PUBLIC_FIREBASE_* to .env.local and restart.");
    const cred = await signInWithPopup(auth, new GoogleAuthProvider());
    const isNewUser = getAdditionalUserInfo(cred)?.isNewUser === true;
    let profile;
    try {
      profile = await getDoc(doc(db, "users", cred.user.uid));
    } catch (error) {
      await signOut(auth);
      throw error;
    }
    if (!isNewUser && profile.exists() && profile.data().role === "seller") return;

    let cleanupFailed = false;
    if (isNewUser) {
      try {
        await deleteUser(cred.user);
      } catch (error) {
        cleanupFailed = true;
        console.error("[KASI] could not remove an unregistered Google seller account:", error);
      }
    }
    if (auth.currentUser) await signOut(auth);
    if (cleanupFailed) {
      throw new Error("This Google account is not registered as a seller, and Firebase could not remove the temporary account automatically. Please contact support.");
    }
    throw new Error("No seller account is registered with this Google account. Create your seller account first, then sign in.");
  };

  /** Email + password sign-in / sign-up (Firebase Email provider), with role. */
  const signInEmail = async (r: Role, email: string, password: string, mode: "signin" | "signup") => {
    if (!auth || !db) throw new Error("Firebase not configured — add NEXT_PUBLIC_FIREBASE_* to .env.local and restart.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email address doesn't look right.");
    if (password.length < 6) throw new Error("Password must be at least 6 characters.");
    const cred = mode === "signup"
      ? await createUserWithEmailAndPassword(auth, email.trim(), password)
      : await signInWithEmailAndPassword(auth, email.trim(), password);
    if (mode === "signup" && cred.user && !cred.user.emailVerified) {
      // Best-effort: the account works without it, so never block signup on this.
      try { await sendEmailVerification(cred.user); } catch (e) {
        console.warn("[KASI] could not send verification email:", e);
      }
    }
    if (r && cred.user) {
      await saveSelectedRole(cred.user, r, {
        email: cred.user.email ?? email.trim(),
        name: cred.user.displayName ?? email.split("@")[0],
      });
    }
  };

  const signInGoogle = () => signIn(null);

  const setRole = async (r: Role) => {
    if (!user) return;
    if (!r) {
      setRoleState(null);
      return;
    }
    await saveSelectedRole(user, r, {
      email: user.email,
      name: user.displayName,
    });
  };

  const signOutNow = async () => { if (auth) await signOut(auth); };

  const resetPassword = async (email: string) => {
    if (!auth) throw new Error("Firebase not configured — add NEXT_PUBLIC_FIREBASE_* to .env.local and restart.");
    const clean = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error("That email address doesn't look right.");
    try {
      await sendPasswordResetEmail(auth, clean);
    } catch (e) {
      // Never reveal whether the address exists: an unknown email produces the
      // same success message as a known one.
      if (e instanceof Error && /user-not-found/i.test(e.message)) return;
      throw e;
    }
  };

  const resendVerification = async () => {
    if (!auth?.currentUser) throw new Error("Sign in first, then request a verification email.");
    if (auth.currentUser.emailVerified) { setEmailVerified(true); return; }
    await sendEmailVerification(auth.currentUser);
  };

  const refreshUser = async () => {
    const u = auth?.currentUser;
    if (!u) { setEmailVerified(false); return; }
    await u.reload();
    await u.getIdToken(true);
    setEmailVerified(Boolean(u.emailVerified));
  };

  return (
    <Ctx.Provider value={{ user, role, isAdmin: Boolean(uid && adminUid === uid), loading, unconfigured: !isFirebaseConfigured, signIn, signInSellerGoogle, signInEmail, signInGoogle, signOutNow, setRole, resetPassword, resendVerification, emailVerified, refreshUser }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
