// src/components/WhatsNewModal.jsx
import React, { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

function NotesRenderer({ notes }) {
  if (!notes) return <p className="text-sm text-gray-600">No release notes available.</p>;

  // electron-updater may hand us HTML for release notes
  if (typeof notes === "string" && /<\/?[a-z][\s\S]*>/i.test(notes)) {
    return (
      <div
        className="whats-new-html text-sm text-gray-700 space-y-1"
        dangerouslySetInnerHTML={{ __html: notes }}
      />
    );
  }

  const lines = String(notes)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return <p className="text-sm text-gray-600">No release notes available.</p>;

  return (
    <ul className="space-y-2">
      {lines.map((line, i) => {
        const match = line.match(/^[-*]\s+(.*)$/);
        const isHeading = !match && /^#{1,3}\s+/i.test(line);
        const text = match ? match[1] : line.replace(/^#{1,3}\s+/i, "").trim();
        return isHeading ? (
          <li key={i} className="font-semibold text-gray-900 mt-3 first:mt-0">
            {text}
          </li>
        ) : (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
            {match && <span className="text-emerald-500 mt-0.5 shrink-0">•</span>}
            <span>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function WhatsNewModal() {
  const [data, setData] = useState(null);
  const isDesktop = typeof window !== "undefined" && !!window.electronAPI?.getPendingUpdateNotes;

  useEffect(() => {
    if (!isDesktop) return undefined;
    window.electronAPI
      .getPendingUpdateNotes()
      .then((d) => setData(d))
      .catch(() => setData(null));
  }, [isDesktop]);

  if (!data) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 text-white">
          <div className="flex items-center gap-2">
            <Sparkles size={20} />
            <span className="text-lg font-bold">What's New in v{data.version}</span>
          </div>
          <button
            onClick={() => setData(null)}
            className="rounded-full p-1 hover:bg-white/20"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          <NotesRenderer notes={data.notes} />
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={() => setData(null)}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
