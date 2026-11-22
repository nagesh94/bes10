"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { saveExternalRefs } from "@/app/actions/installation";

const cell =
  "h-11 w-full rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const labelCls = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";
const button =
  "h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60";

/**
 * Every panel serial in one read-only box, newline-separated, for pasting
 * straight into the DCR registry's own serial field — faster and safer than
 * copying one at a time off the stage 3 list.
 */
export function PanelSerialsCopyBox({ serials }: { serials: string[] }) {
  const t = useTranslations("installation");
  const [copied, setCopied] = useState(false);
  const text = serials.join("\n");

  return (
    <div className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
      <div className="mb-0.5 flex flex-wrap items-baseline gap-2">
        <h2 className="flex-1 text-base font-bold">{t("refs.serialsTitle")}</h2>
        <span className="ref text-[12.5px] font-semibold text-[var(--muted)]">
          {serials.length}
        </span>
      </div>
      <p className="mb-3 text-[13px] text-[var(--muted)]">{t("refs.onePerLine")}</p>
      <textarea
        readOnly
        rows={Math.min(Math.max(serials.length, 3), 10)}
        value={text}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={t("refs.serialsTitle")}
        className="ref mb-3 w-full resize-y rounded-[7px] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-[13.5px] outline-none focus:border-[var(--orange)]"
      />
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        disabled={!text}
        className="h-10 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-bold text-[var(--navy-text)] disabled:opacity-60"
      >
        {copied ? t("refs.copied") : t("refs.copyAll")}
      </button>
    </div>
  );
}

/** The certificate number and issue date, copied off the raised certificate. */
export function DcrDetails({
  projectId,
  initial,
}: {
  projectId: string;
  initial: { dcrNumber: string; dcrIssuedOn: string };
}) {
  const t = useTranslations("installation");
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <div>
      <h2 className="mb-0.5 text-base font-bold">{t("refs.certTitle")}</h2>
      <p className="mb-4 text-[13px] text-[var(--muted)]">{t("refs.copyFromCert")}</p>

      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        <div>
          <label className={labelCls} htmlFor="dcrNumber">{t("refs.dcrNumber")}</label>
          <input
            id="dcrNumber"
            value={v.dcrNumber}
            onChange={(e) => {
              setV((o) => ({ ...o, dcrNumber: e.target.value }));
              setSaved(false);
            }}
            placeholder="DCR/2026/0004821"
            className={`${cell} ref`}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="dcrIssuedOn">{t("refs.issuedOn")}</label>
          <input
            id="dcrIssuedOn"
            type="date"
            value={v.dcrIssuedOn}
            onChange={(e) => {
              setV((o) => ({ ...o, dcrIssuedOn: e.target.value }));
              setSaved(false);
            }}
            className={cell}
          />
        </div>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await saveExternalRefs(projectId, v);
          setPending(false);
          setSaved(true);
          router.refresh();
        }}
        className={button}
      >
        {pending ? t("common.saving") : saved ? t("common.saved") : t("refs.saveCert")}
      </button>
    </div>
  );
}

/**
 * The net meter fee paid on the DISCOM portal.
 *
 * The amount is the DISCOM's published fee that the consumer pays, not our
 * pricing, so it is not behind the money boundary — an employee filing the
 * receipt needs to see it.
 */
export function MeterPayment({
  projectId,
  initial,
}: {
  projectId: string;
  initial: { meterPaymentRef: string; meterPaidOn: string; meterAmount: string };
}) {
  const t = useTranslations("installation");
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  const fields: Array<[keyof typeof initial, string, string, boolean]> = [
    ["meterPaymentRef", t("refs.paymentRef"), "SSJ2026041700731", true],
    ["meterAmount", t("refs.amountPaid"), "4720", true],
  ];

  return (
    <div>
      <h2 className="mb-0.5 text-base font-bold">{t("refs.paymentTitle")}</h2>
      <p className="mb-4 text-[13px] text-[var(--muted)]">{t("refs.fromReceipt")}</p>

      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {fields.map(([key, label, placeholder, mono]) => (
          <div key={key}>
            <label className={labelCls} htmlFor={key}>{label}</label>
            <input
              id={key}
              value={v[key]}
              onChange={(e) => {
                setV((o) => ({ ...o, [key]: e.target.value }));
                setSaved(false);
              }}
              placeholder={placeholder}
              {...(key === "meterAmount" ? { inputMode: "decimal" as const } : {})}
              className={`${cell} ${mono ? "ref" : ""}`}
            />
          </div>
        ))}
        <div>
          <label className={labelCls} htmlFor="meterPaidOn">{t("refs.paidOn")}</label>
          <input
            id="meterPaidOn"
            type="date"
            value={v.meterPaidOn}
            onChange={(e) => {
              setV((o) => ({ ...o, meterPaidOn: e.target.value }));
              setSaved(false);
            }}
            className={cell}
          />
        </div>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await saveExternalRefs(projectId, v);
          setPending(false);
          setSaved(true);
          router.refresh();
        }}
        className={button}
      >
        {pending ? t("common.saving") : saved ? t("common.saved") : t("refs.savePayment")}
      </button>
    </div>
  );
}
