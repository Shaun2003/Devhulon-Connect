"use client";
import { useState, type FormEvent } from "react";
import { createBooking } from "@/lib/repo";
import { BOOKING_LIMITS, bookingToday, validateBooking } from "@/lib/bookings";
import { KIcon } from "@/lib/icons";
import { SignInInline } from "@/components/dash/parts";
import { useAuth } from "@/components/AuthProvider";

const inputCls =
  "mt-1 w-full rounded-2xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-4 py-2.5 text-sm font-normal bg-[#f2f6fa]/40 outline-none";

const DURATIONS = [
  { v: 0.5, label: "30 minutes" },
  { v: 1, label: "1 hour" },
  { v: 1.5, label: "1.5 hours" },
  { v: 2, label: "2 hours" },
  { v: 3, label: "3 hours" },
  { v: 4, label: "4 hours" },
  { v: 8, label: "Full day (8h)" },
];

/**
 * Buyer booking request (spec §39). Lives on the public profile next to the
 * contact actions; the seller confirms/moves it from their hub, and both sides
 * get notifications. Rules pin buyerUid to the caller and the status machine.
 */
export default function BookingRequestForm({
  businessId,
  businessName,
  sellerUid,
  hours,
}: {
  businessId: string;
  businessName: string;
  sellerUid?: string;
  hours?: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [durationHours, setDurationHours] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (!sellerUid) return null; // nothing to book against

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const issues = validateBooking({ date, time, durationHours, note });
    if (issues.length > 0) { setError(issues[0]); return; }
    setBusy(true);
    setError(null);
    try {
      await createBooking({
        businessId,
        date: date.slice(0, 10),
        time: time.slice(0, 5),
        durationHours: Number(durationHours),
        note,
      });
      setDone(`Booking requested for ${date} at ${time} — you'll get a notification when ${businessName} confirms.`);
      setOpen(false);
      setDate(""); setTime(""); setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the booking request.");
    } finally {
      setBusy(false);
    }
  }
  if (!user) {
    return (
      <div className="hippo-card p-5">
        <div className="flex items-center gap-2">
          <KIcon name="calendar" size={18} className="text-[#558c2b]" />
          <h2 className="font-black text-[#10243e]">Book {businessName}</h2>
        </div>
        <p className="text-sm text-[#1d3a5f]/70 mt-1">
          Pick a date and time and the business confirms it in their diary. Sign in to request a
          booking — it&apos;s free.
        </p>
        <div className="mt-3"><SignInInline /></div>
      </div>
    );
  }

  return (
    <div className="hippo-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <KIcon name="calendar" size={18} className="text-[#558c2b]" />
        <h2 className="font-black text-[#10243e]">Book {businessName}</h2>
        {!open && !done && (
          <button onClick={() => { setOpen(true); setError(null); }} className="ml-auto btn-hippo text-sm">
            Request a booking →
          </button>
        )}
      </div>

      {done && !open && (
        <p className="mt-2 text-sm font-bold text-[#3c6b1d] bg-[#e8f6d8] rounded-2xl px-4 py-3 inline-flex items-center gap-1.5">
          <KIcon name="check" size={15} /> {done}
        </p>
      )}
      {error && !open && <p className="mt-2 text-sm font-bold text-red-700 bg-red-50 rounded-2xl px-4 py-3">{error}</p>}

      {open ? (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="block text-sm font-bold text-[#10243e]">
              Date *
              <input type="date" required min={bookingToday()} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </label>
            <label className="block text-sm font-bold text-[#10243e]">
              Start time *
              <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
            </label>
            <label className="block text-sm font-bold text-[#10243e]">
              How long? *
              <select value={durationHours} onChange={(e) => setDurationHours(e.target.value)} className={inputCls}>
                {DURATIONS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-sm font-bold text-[#10243e]">
            What do you need done?
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, BOOKING_LIMITS.note))}
              placeholder="e.g. Kitchen tap replacement — parts on hand."
              className={inputCls}
            />
          </label>
          {hours && hours.toLowerCase() !== "call for hours" && (
            <p className="text-[11px] text-[#1d3a5f]/60">Their hours: {hours} — they can still accept outside these.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button disabled={busy} className="btn-hippo text-sm disabled:opacity-60">
              {busy ? "Sending…" : "Request booking →"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setError(null); }} className="text-sm font-bold text-[#1d3a5f]/70 hover:underline">
              Cancel
            </button>
            {error && <span className="text-xs font-bold text-red-700 bg-red-50 rounded-2xl px-3 py-2">{error}</span>}
          </div>
        </form>
      ) : null}
    </div>
  );
}
