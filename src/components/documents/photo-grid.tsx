"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  deletePhoto,
  finalisePhotoUpload,
  getPhotoUrl,
  requestPhotoUpload,
  type PhotoType,
} from "@/app/actions/photos";
import { useConfirm } from "@/components/shell/confirm";
import { openFile, saveFile } from "@/lib/documents/open-file";
import { putUpload } from "@/lib/storage/browser-put";

export interface PhotoItem {
  id: string;
  url: string | null;
  capturedAt: Date | string | null;
  lat: string | null;
  lng: string | null;
}

/** Asks the browser once, and never blocks the upload if it is refused. */
function currentPosition(): Promise<GeolocationPosition | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

export function PhotoGrid({
  projectId,
  photoType,
  label,
  hint,
  photos,
}: {
  projectId: string;
  photoType: PhotoType;
  label: string;
  hint?: string;
  photos: PhotoItem[];
}) {
  const router = useRouter();
  const ask = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function uploadAll(files: File[]) {
    setError(null);
    setNotice(null);

    // One location fix for the batch — they were all taken in the same place.
    setBusy("Getting location…");
    const pos = await currentPosition();
    const geo = pos
      ? {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
          capturedAt: new Date().toISOString(),
        }
      : undefined;

    let started = 0;
    let uploaded = 0;
    let stampedCount = 0;

    for (const file of files) {
      started += 1;
      setBusy(`Uploading ${started} of ${files.length}…`);
      try {
        const presigned = await requestPhotoUpload(projectId, photoType, file.name, file.type);
        if (!presigned.ok) {
          setError(presigned.error);
          break;
        }

        const put = await putUpload(presigned.uploadUrl, file);
        if (!put.ok) {
          setError(`${file.name}: ${put.error}`);
          break;
        }

        const saved = await finalisePhotoUpload(
          projectId,
          photoType,
          presigned.tempKey,
          file.name,
          geo,
        );
        if (!saved.ok) {
          setError(saved.error);
          break;
        }
        uploaded += 1;
        if (saved.stamped) stampedCount += 1;
      } catch (err) {
        // Only a thrown server action lands here — the direct PUT reports its
        // own failures above. Production redacts the message, so the console
        // is the only place the reason can be read.
        console.error(`[photo] upload failed on ${file.name}`, err);
        setError(`Something went wrong on ${file.name}.`);
        break;
      }
    }

    setBusy(null);
    if (uploaded > 0) {
      setNotice(
        geo
          ? `${stampedCount} of ${uploaded} geotagged and stamped.`
          : `${uploaded} uploaded. Location was unavailable, so nothing was stamped.`,
      );
    }
    router.refresh();
  }

  async function open(id: string) {
    const res = await getPhotoUrl(id, "original");
    if (res.ok) openFile(res.url);
  }

  async function download(id: string) {
    const res = await getPhotoUrl(id, "original", "attachment");
    if (res.ok) saveFile(res.url);
    else setError(res.error);
  }

  /**
   * Asking first is new. The × sits on the corner of a thumbnail, on a phone,
   * in gloves — and it used to delete the photo on the first tap.
   */
  async function remove(id: string) {
    const answer = await ask({
      title: "Remove this photo?",
      body: "It is deleted from the project and cannot be recovered. The photo can be taken again.",
      confirmLabel: "Remove it",
    });
    if (!answer.confirmed) return;

    setBusy("Removing…");
    setError(null);
    const result = await deletePhoto(projectId, id);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-baseline gap-2">
        <h4 className="flex-1 text-sm font-bold">{label}</h4>
        <span className="ref text-[12px] text-[var(--muted)]">
          {photos.length} {photos.length === 1 ? "photo" : "photos"}
        </span>
      </div>
      {hint ? <p className="mb-3 text-[12.5px] text-[var(--muted)]">{hint}</p> : null}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
        {photos.map((p) => (
          <figure
            key={p.id}
            className="group relative overflow-hidden rounded-[9px] border border-[var(--line)] bg-[var(--surface-2)]"
          >
            <button
              type="button"
              onClick={() => open(p.id)}
              className="block aspect-[4/3] w-full cursor-pointer"
              aria-label="Open the full-size photo"
            >
              {p.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center text-[11px] text-[var(--muted)]">
                  No preview
                </span>
              )}
            </button>

            {p.lat && p.lng ? (
              <figcaption className="ref absolute right-0 bottom-0 left-0 bg-[rgba(2,13,30,0.82)] px-1.5 py-1 text-[8.5px] leading-tight text-[#E6EDF7]">
                {Number(p.lat).toFixed(4)}°N {Number(p.lng).toFixed(4)}°E
              </figcaption>
            ) : null}

            <button
              type="button"
              onClick={() => void download(p.id)}
              aria-label="Download the full-size photo"
              title="Save this photo to this computer"
              className="absolute top-1.5 right-9 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-[rgba(2,13,30,0.72)] text-white"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 4v11" />
                <path d="M7.5 11l4.5 4.5 4.5-4.5" />
                <path d="M5 19.5h14" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => remove(p.id)}
              aria-label="Remove this photo"
              className="absolute top-1.5 right-1.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-[rgba(2,13,30,0.72)] text-xs font-bold text-white"
            >
              ×
            </button>
          </figure>
        ))}

        <button
          type="button"
          disabled={busy !== null}
          onClick={() => inputRef.current?.click()}
          className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[9px] border-[1.5px] border-dashed border-[var(--orange)] bg-[var(--orange-soft)] text-[var(--orange-text)] disabled:opacity-60"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 8a2 2 0 012-2h2.2l1.3-2h7l1.3 2H20a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <circle cx="12" cy="12.5" r="3.4" />
          </svg>
          <span className="px-2 text-center text-[11.5px] font-bold">
            {busy ?? (photos.length ? "Add more" : "Add photos")}
          </span>
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void uploadAll(files);
          e.target.value = "";
        }}
      />

      {error ? (
        <p role="alert" className="mt-2.5 text-[12px] font-medium text-[var(--red-text)]">{error}</p>
      ) : notice ? (
        <p className="mt-2.5 text-[12px] font-medium text-[var(--green-text)]">{notice}</p>
      ) : null}
    </div>
  );
}
