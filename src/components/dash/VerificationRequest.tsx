"use client";

/**
 * Seller-facing verification request panel (§8 Phase 1).
 *
 * - Submits via POST /api/seller/verify-request (ID-token authenticated; the
 *   route takes the uid from the VERIFIED token — never from the body).
 * - Status is a REALTIME subscription to verification_requests/{uid}, so the
 *   display flips live the moment an admin approves or rejects.
 * - Documents are uploaded via lib/storage BEFORE submitting — only the
 *   resulting URLs are sent to the server, never file bytes.
 * - A seller may re-request after a rejection, but never while pending.
 */

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { auth } from "@/lib/firebase";
import { useRealtime, subscribeMyVerificationRequest } from "@/lib/realtime";
import { uploadSellerDocument } from "@/lib/storage";
import { Panel, ErrorNote } from "@/components/dash/parts";
import { VERIFICATION_METHODS, VERIFICATION_METHOD_LABEL, type VerificationMethod } from "@/lib/verification";

const inputCls =
  "mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-3 text-sm font-normal bg-[#f2f6fa]/40 outline-none";

/** The slice of verification_requests/{uid} this panel reads. */
type VerificationRow = {
  status?: string;
  method?: string;
  notes?: string;
  createdAt?: string;
  businessId?: string;
  businessName?: string;
  documents?: { idFront?: string; idBack?: string; proofAddress?: string };
};

export default function VerificationRequest({
  businessId,
  businessName,
}: {
  /** Primary listing id/name — passed from the dashboard's businesses feed. */
  businessId: string;
  businessName: string;
}) {
  const { user } = useAuth();
  const uid = user?.uid ?? "";

  // Live status: rows[0] is the verification_requests/{uid} doc (absent → []).
  const vreq = useRealtime<VerificationRow>(
    (setRows, onError) =>
      uid
        ? subscribeMyVerificationRequest(uid, (row) => setRows(row ? [row as VerificationRow] : []), onError)
        : () => {},
    [],
    [uid]
  );
  const request: VerificationRow | null = vreq.rows[0] ?? null;

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [method, setMethod] = useState<VerificationMethod>("documents");

  const [idFrontUrl, setIdFrontUrl] = useState<string | null>(null);
  const [idBackUrl, setIdBackUrl] = useState<string | null>(null);
  const [proofAddressUrl, setProofAddressUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  const canRequest = !request || request.status !== "pending";

  const uploadDoc = async (file: File, type: "idFront" | "idBack" | "proofAddress") => {
    setUploading((p) => ({ ...p, [type]: true }));
    try {
      let docType: "id-front" | "id-back" | "proof-address";
      if (type === "idFront") docType = "id-front";
      else if (type === "idBack") docType = "id-back";
      else docType = "proof-address";
      const url = await uploadSellerDocument(uid, docType, file);
      if (type === "idFront") setIdFrontUrl(url);
      else if (type === "idBack") setIdBackUrl(url);
      else setProofAddressUrl(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading((p) => ({ ...p, [type]: false }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error("Sign in to request verification.");
      // Flat body fields — the route reads idFrontUrl / idBackUrl / proofAddressUrl.
      const res = await fetch("/api/seller/verify-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          businessId: businessId || request?.businessId || "",
          businessName: businessName || request?.businessName || "",
          method,
          idFrontUrl: idFrontUrl || request?.documents?.idFront || "",
          idBackUrl: idBackUrl || request?.documents?.idBack || "",
          proofAddressUrl: proofAddressUrl || request?.documents?.proofAddress || "",
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Request failed. Try again.");
      // Success: the realtime subscription flips the display to "under review".
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Request Verification" count={request?.status === "approved" ? 1 : 0} live={false}>
      <ErrorNote error={vreq.error} />
      {err && <p className="text-xs font-bold text-[#a36508] bg-[#fff4d6] rounded-2xl px-3 py-2">{err}</p>}

      {request?.status === "approved" && (
        <div className="rounded-xl bg-[#e8f6d8] border border-[#bfe3c9] p-4 mb-4">
          <h3 className="font-black text-[#3c6b1d] mb-1">Verified ✓</h3>
          <p className="text-sm text-[#3c6b1d]/80">
            Your business <strong>{request.businessName}</strong> is verified.
          </p>
        </div>
      )}

      {request?.status === "rejected" && (
        <div className="rounded-xl bg-[#fdecea] border border-[#f5c6c7] p-4 mb-4">
          <h3 className="font-black text-[#c0392b] mb-1">Returned for review</h3>
          <p className="text-sm text-[#c0392b]/80">{request.notes || "Update your documents and re-submit."}</p>
        </div>
      )}

      {request?.status === "pending" && (
        <div className="rounded-xl bg-[#eef3f8] border border-[#d6e1ec] p-4 mb-4">
          <h3 className="font-black text-[#10243e] mb-1">Under review</h3>
          <p className="text-sm text-[#1d3a5f]/70">
            Your verification request is being reviewed by our team.
          </p>
        </div>
      )}

      {!request || request.status !== "approved" ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-[#10243e]">Business name <span className="text-red-600">*</span></label>
              <input
                value={businessName || request?.businessName || ""}
                disabled
                className={`${inputCls} opacity-60`}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-[#10243e]">Verification method <span className="text-red-600">*</span></label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as VerificationMethod)}
                className={inputCls}
              >
                {VERIFICATION_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {VERIFICATION_METHOD_LABEL[m as keyof typeof VERIFICATION_METHOD_LABEL]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-[#10243e]">ID / Passport (front) <span className="text-red-600">*</span></label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,image/*"
                className="block w-full text-sm text-[#10243e] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#10243e] file:text-white hover:file:bg-[#1d3a5f]"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadDoc(f, "idFront");
                }}
              />
              {idFrontUrl && <p className="text-xs text-[#3c6b1d] mt-1">ID uploaded · <span className="font-bold text-[#558c2b]">View →</span></p>}
              {uploading.idFront && <p className="text-xs text-[#1d3a5f]/60 mt-1">Uploading…</p>}
            </div>
            <div>
              <label className="block text-sm font-bold text-[#10243e]">ID / Passport (back)</label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,image/*"
                className="block w-full text-sm text-[#10243e] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#10243e] file:text-white hover:file:bg-[#1d3a5f]"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadDoc(f, "idBack");
                }}
              />
              {idBackUrl && <p className="text-xs text-[#3c6b1d] mt-1">ID back uploaded · <span className="font-bold text-[#558c2b]">View →</span></p>}
              {uploading.idBack && <p className="text-xs text-[#1d3a5f]/60 mt-1">Uploading…</p>}
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-bold text-[#10243e]">Proof of address <span className="text-red-600">*</span></label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,image/*"
              className="block w-full text-sm text-[#10243e] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#10243e] file:text-white hover:file:bg-[#1d3a5f]"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadDoc(f, "proofAddress");
              }}
            />
            {proofAddressUrl && <p className="text-xs text-[#3c6b1d] mt-1">Proof uploaded · <span className="font-bold text-[#558c2b]">View →</span></p>}
            {uploading.proofAddress && <p className="text-xs text-[#1d3a5f]/60 mt-1">Uploading…</p>}
          </div>

          <p className="text-xs text-[#1d3a5f]/60 mt-2">
            Documents are reviewed by our team. Status flips live here and you&apos;ll receive an email when decided.
          </p>

          <button
            type="submit"
            disabled={busy || !canRequest || !businessId || !(idFrontUrl && proofAddressUrl)}
            className={`btn-hippo text-sm w-full md:w-auto ${busy || !canRequest || !businessId || !(idFrontUrl && proofAddressUrl) ? "disabled:opacity-60" : ""}`}
          >
            {busy ? "Submitting…" : !canRequest ? "Already under review" : !businessId ? "List your business first" : idFrontUrl && proofAddressUrl ? "Request verification" : "Upload ID + proof of address"}
          </button>
        </form>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm text-[#1d3a5f]/70">Your verification is approved. <Link href="/dashboard" className="text-[#558c2b] font-bold hover:underline">Go to dashboard</Link>.</p>
        </div>
      )}
    </Panel>
  );
}