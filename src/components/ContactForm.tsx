"use client";
import { useState } from "react";
import { CONTACT_EMAIL, SITE_SHORT } from "@/lib/site";

const topics = [
  "General question",
  "Report a listing or review",
  "My business listing (owner)",
  "Advertising & plans",
  "Privacy / POPIA request",
  "Jobs, events or deals",
];

/** Zero-backend contact form: composes an email in the visitor's own mail app. */
export default function ContactForm() {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState(topics[0]);
  const [msg, setMsg] = useState("");
  const subject = `[${topic}] ${name.trim() || `${SITE_SHORT} visitor`}`;
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`;
  const ready = msg.trim().length >= 5;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) window.location.href = mailto;
      }}
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block text-sm font-bold text-[#10243e]">
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Thabo M."
            className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-3 py-2.5 text-sm font-normal outline-none"
          />
        </label>
        <label className="block text-sm font-bold text-[#10243e]">
          Topic
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-3 py-2.5 text-sm font-normal outline-none bg-white"
          >
            {topics.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm font-bold text-[#10243e]">
        Message
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          rows={5}
          placeholder="Tell us what's up — include the business name or link if you're reporting something."
          className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-3 py-2.5 text-sm font-normal outline-none resize-y"
        />
      </label>
      <button type="submit" disabled={!ready} className="btn-hippo text-sm disabled:opacity-50">
        Open in my email app 
      </button>
      <p className="text-xs text-[#1d3a5f]/60">
        This opens your email app with everything pre-filled — we never see your keystrokes.
      </p>
    </form>
  );
}
