"use client";
/* eslint-disable @next/next/no-img-element -- the preview is a blob: object URL
   from URL.createObjectURL; next/image does not optimise blob URLs. */
import { KIcon } from "@/lib/icons";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { addBusinessPhotoLink } from "@/lib/repo";
import { uploadBusinessPhoto } from "@/lib/storage";
import { useAuth } from "./AuthProvider";

export default function PhotoUploader({ businessId }: { businessId: string }) {
  const { user } = useAuth();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [link, setLink] = useState("");

  async function onAddLink(e: FormEvent) {
    e.preventDefault();
    const url = link.trim();
    if (!/^https?:\/\/.+/i.test(url)) {
      setMsg("Paste a photo link starting with https:// (e.g. from Unsplash or your Facebook page photo).");
      return;
    }
    if (!user) {
      setMsg("Sign in as the listing owner to add photos — only the owner can update the gallery.");
      return;
    }
    setBusy(true);
    try {
      await addBusinessPhotoLink(businessId, url);
      setMsg("Photo link saved — it will appear in the gallery.");
      setLink("");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not save link.");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setMsg("Please choose an image file."); return; }
    if (file.size > 5 * 1024 * 1024) { setMsg("Max 5MB per photo."); return; }
    if (!user) { setMsg("Sign in as the listing owner to upload photos."); return; }
    setBusy(true);
    setMsg("Uploading…");
    setPreview(URL.createObjectURL(file));
    try {
      const url = await uploadBusinessPhoto(businessId, user!.uid, file);
      await addBusinessPhotoLink(businessId, url);
      setMsg("Photo uploaded — it will appear in the gallery.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Upload failed. Use the free photo-link option below instead — no billing needed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-5">
      <h2 className="font-bold">Add photos</h2>
      <p className="text-xs text-zinc-500 mt-1">Option A: direct upload (needs Blaze billing) · Option B below: <b>free photo link — no billing needed</b>.</p>
      <label className="mt-3 inline-block cursor-pointer rounded-xl bg-zinc-900 text-white text-sm font-bold px-4 py-2.5">
        {busy ? "Uploading…" : <><KIcon name="camera" size={15} className="inline shrink-0" /> Choose photo</>}
        <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={busy} />
      </label>
      {preview && <img src={preview} alt="preview" className="mt-3 h-32 w-auto rounded-xl border object-cover" />}
      <form onSubmit={onAddLink} className="mt-4 flex flex-col sm:flex-row gap-2">
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://…/shopfront.jpg (free, no billing)"
          className="flex-1 rounded-xl border px-3 py-2.5 text-sm"
        />
        <button disabled={busy || !link.trim()} className="rounded-xl bg-green-800 text-white text-sm font-bold px-4 py-2.5 disabled:opacity-50">
          Add photo link
        </button>
      </form>
      {msg && <p className="text-sm font-semibold text-green-800 mt-2">{msg}</p>}
    </div>
  );
}
