"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/app/actions/preferences";

/**
 * Language switch on the sign-in page.
 *
 * It lives here rather than only in Settings because someone who reads Hindi
 * needs it before they can sign in, not after.
 */
export function LocaleLinks() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(locale: "en" | "hi") {
    startTransition(async () => {
      await setLocale(locale);
      router.refresh();
    });
  }

  return (
    <div className="mt-[22px] text-center text-[12.5px] text-[#9FB6D1]">
      <button
        type="button"
        onClick={() => choose("en")}
        disabled={pending}
        className="cursor-pointer font-semibold text-[#9FB6D1] hover:text-[#CFE0F2]"
      >
        English
      </button>
      <span className="mx-2 opacity-60">·</span>
      <button
        type="button"
        onClick={() => choose("hi")}
        disabled={pending}
        className="cursor-pointer font-deva font-semibold text-[#9FB6D1] hover:text-[#CFE0F2]"
      >
        हिंदी
      </button>
    </div>
  );
}
