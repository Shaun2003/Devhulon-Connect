"use client";

/* eslint-disable @next/next/no-img-element -- profile preview uses user-uploaded Storage URLs. */
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { uploadProfilePhoto } from "@/lib/storage";

export default function AccountSettings() {
  const { user, profileName, profilePhotoURL, profilePhoneNumber, resetPassword, emailVerified, resendVerification } = useAuth();
  const [displayName, setDisplayName] = useState(profileName || user?.displayName || "");
  const [phoneNumber, setPhoneNumber] = useState(profilePhoneNumber);
  const [photoURL, setPhotoURL] = useState(profilePhotoURL || user?.photoURL || "");
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [liveUid, setLiveUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const live = Boolean(user?.uid && liveUid === user.uid);

  useEffect(() => {
    if (!db || !user?.uid) return;
    return onSnapshot(
      doc(db, "users", user.uid),
      (snapshot) => {
        const data = snapshot.data();
        const name = data?.name;
        const phone = data?.phoneNumber;
        const photo = data?.photoURL;
        if (typeof name === "string" && name.trim()) setDisplayName(name);
        if (typeof phone === "string") setPhoneNumber(phone);
        if (typeof photo === "string") setPhotoURL(photo);
        setLiveUid(user.uid);
      },
      (listenerError) => {
        setLiveUid(null);
        setError(`Live profile updates are unavailable: ${listenerError.message}`);
      },
    );
  }, [user?.uid]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const cleanName = displayName.trim();
    const normalizedPhone = phoneNumber.trim().replace(/[^\d+]/g, "");
    if (cleanName.length < 2 || cleanName.length > 80) {
      setError("Your name must be between 2 and 80 characters.");
      setNotice(null);
      return;
    }
    if (normalizedPhone && !/^(?:\+27\d{9}|0\d{9})$/.test(normalizedPhone)) {
      setError("Enter a valid South African number, for example 082 123 4567.");
      setNotice(null);
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/account/settings", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ displayName: cleanName, phoneNumber: normalizedPhone }),
      });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "We could not save your profile right now.");
      }
      setDisplayName(cleanName);
      setNotice("Your profile details were updated and are now live across your account.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "We could not save your profile right now.");
    } finally {
      setSaving(false);
    }
  }

  async function onPhotoSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file for your profile photo.");
      setNotice(null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Profile photos must be smaller than 5MB.");
      setNotice(null);
      return;
    }

    setUploadingPhoto(true);
    setError(null);
    setNotice(null);
    const previewUrl = URL.createObjectURL(file);
    setPhotoURL(previewUrl);
    try {
      const uploadedUrl = await uploadProfilePhoto(user.uid, file);
      const token = await user.getIdToken();
      const response = await fetch("/api/account/settings", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ photoURL: uploadedUrl }),
      });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Could not save your profile photo.");
      setPhotoURL(uploadedUrl);
      setNotice("Your profile photo was updated.");
    } catch (photoError) {
      setPhotoURL(profilePhotoURL || user.photoURL || "");
      setError(photoError instanceof Error ? photoError.message : "Could not update your profile photo.");
    } finally {
      URL.revokeObjectURL(previewUrl);
      setUploadingPhoto(false);
    }
  }

  async function sendPasswordReset() {
    if (!user?.email) {
      setError("There is no email address on this account to send a password reset to.");
      return;
    }
    setSendingReset(true);
    setError(null);
    setNotice(null);
    try {
      await resetPassword(user.email);
      setNotice(`If ${user.email} is eligible, a password reset link will arrive shortly.`);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Could not send the password reset email.");
    } finally {
      setSendingReset(false);
    }
  }

  async function sendVerification() {
    setSendingVerification(true);
    setError(null);
    setNotice(null);
    try {
      await resendVerification();
      setNotice("A verification email has been sent to your account address.");
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : "Could not send the verification email.");
    } finally {
      setSendingVerification(false);
    }
  }

  return (
    <section className="hippo-card min-w-0 space-y-5 p-5 sm:p-6" aria-labelledby="account-settings-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="account-settings-title" className="text-xl font-black text-[#10243e]">Account settings</h2>
          <p className="mt-1 text-sm text-[#1d3a5f]/70">Manage the personal details and sign-in security for your DevhulonConnect account.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${live ? "bg-[#e8f6d8] text-[#3c6b1d]" : "bg-[#f2f6fa] text-[#1d3a5f]/65"}`} role="status" aria-live="polite">
          {live ? "Live updates on" : "Connecting…"}
        </span>
      </div>

      <form className="max-w-xl space-y-4" onSubmit={(event) => void saveProfile(event)}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-[#e8f6d8] text-2xl font-black text-[#315d18] ring-2 ring-[#d6e1ec]" aria-label="Profile photo preview">
            {photoURL
              ? <img src={photoURL} alt="" className="h-full w-full object-cover" />
              : (displayName.trim().slice(0, 1) || user?.email?.slice(0, 1) || "?").toUpperCase()}
          </div>
          <div>
            <label htmlFor="account-profile-photo" className={`inline-flex cursor-pointer rounded-full border border-[#d6e1ec] px-4 py-2 text-sm font-bold text-[#10243e] hover:bg-[#f2f6fa] ${uploadingPhoto ? "pointer-events-none opacity-60" : ""}`}>
              {uploadingPhoto ? "Uploading…" : "Change profile photo"}
            </label>
            <input id="account-profile-photo" type="file" accept="image/*" className="sr-only" onChange={(event) => void onPhotoSelected(event)} disabled={uploadingPhoto} />
            <p className="mt-1.5 text-xs text-[#1d3a5f]/60">Image file, up to 5MB.</p>
          </div>
        </div>
        <div>
          <label htmlFor="account-display-name" className="mb-1.5 block text-sm font-bold text-[#10243e]">Full name <span aria-hidden="true" className="text-red-600">*</span></label>
          <input
            id="account-display-name"
            name="displayName"
            type="text"
            autoComplete="name"
            required
            minLength={2}
            maxLength={80}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "account-settings-error" : undefined}
            className="w-full rounded-xl border border-[#d6e1ec] bg-white px-3.5 py-3 text-sm text-[#10243e] outline-none focus:border-[#7ac142] focus:ring-2 focus:ring-[#7ac142]/30"
          />
        </div>
        <div>
          <label htmlFor="account-email" className="mb-1.5 block text-sm font-bold text-[#10243e]">Email address</label>
          <input
            id="account-email"
            type="email"
            autoComplete="email"
            value={user?.email ?? ""}
            readOnly
            className="w-full rounded-xl border border-[#d6e1ec] bg-[#f7fafc] px-3.5 py-3 text-sm text-[#1d3a5f]/70"
          />
          <p className="mt-1.5 text-xs text-[#1d3a5f]/60">Your sign-in email cannot be changed here.</p>
        </div>
        <div>
          <label htmlFor="account-phone-number" className="mb-1.5 block text-sm font-bold text-[#10243e]">Phone number <span className="font-medium text-[#1d3a5f]/60">(Optional)</span></label>
          <input
            id="account-phone-number"
            name="phoneNumber"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "account-settings-error" : "account-phone-help"}
            placeholder="082 123 4567"
            className="w-full rounded-xl border border-[#d6e1ec] bg-white px-3.5 py-3 text-sm text-[#10243e] outline-none focus:border-[#7ac142] focus:ring-2 focus:ring-[#7ac142]/30"
          />
          <p id="account-phone-help" className="mt-1.5 text-xs text-[#1d3a5f]/60">Enter a South African number. It is saved to your private account profile.</p>
        </div>
        <button type="submit" disabled={saving || !user} className="btn-hippo text-sm disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>

      <div className="max-w-xl border-t border-[#e7eef5] pt-5">
        <h3 className="font-black text-[#10243e]">Sign-in and security</h3>
        <p className="mt-1 text-sm text-[#1d3a5f]/70">Send a secure password reset link to your account email.</p>
        <button type="button" onClick={() => void sendPasswordReset()} disabled={sendingReset || !user?.email} className="mt-3 rounded-full border border-[#d6e1ec] px-4 py-2 text-sm font-bold text-[#10243e] hover:bg-[#f2f6fa] disabled:opacity-60">
          {sendingReset ? "Sending…" : "Send password reset link"}
        </button>
        {user?.email && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className={`font-semibold ${emailVerified ? "text-[#3c6b1d]" : "text-[#1d3a5f]/70"}`}>
              {emailVerified ? "Email verified" : "Email not verified"}
            </span>
            {!emailVerified && (
              <button type="button" onClick={() => void sendVerification()} disabled={sendingVerification} className="font-bold text-[#3c6b1d] underline underline-offset-2 disabled:opacity-60">
                {sendingVerification ? "Sending…" : "Send verification email"}
              </button>
            )}
          </div>
        )}
      </div>

      {error && <p id="account-settings-error" role="alert" className="rounded-xl bg-red-50 px-3.5 py-3 text-sm font-semibold text-red-800">{error}</p>}
      {notice && <p role="status" aria-live="polite" className="rounded-xl bg-[#e8f6d8] px-3.5 py-3 text-sm font-semibold text-[#315d18]">{notice}</p>}
    </section>
  );
}
