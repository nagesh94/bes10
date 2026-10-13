import Image from "next/image";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth/login-form";
import { LocaleLinks } from "@/components/shell/locale-links";
import { getActor } from "@/lib/session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ inactive?: string }>;
}) {
  const actor = await getActor();
  if (actor) redirect("/");

  const inactive = (await searchParams).inactive === "1";
  const t = await getTranslations("auth");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#061A30] px-6 py-12">
      {/* A solar array, drawn rather than photographed: fine cell lines on a
          74px grid, heavier module frames every 4 cells across and 8 down. */}
      <div
        aria-hidden
        className="absolute -inset-[28%] rotate-[-9deg] bg-[#0A2742]"
        style={{
          backgroundImage: [
            "repeating-linear-gradient(to right, rgba(128,178,238,0.30) 0 2px, transparent 2px 296px)",
            "repeating-linear-gradient(to bottom, rgba(128,178,238,0.30) 0 2px, transparent 2px 592px)",
            "repeating-linear-gradient(to right, rgba(128,178,238,0.13) 0 1px, transparent 1px 74px)",
            "repeating-linear-gradient(to bottom, rgba(128,178,238,0.13) 0 1px, transparent 1px 74px)",
          ].join(","),
        }}
      />

      {/* Glass catching the sun */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(118deg, rgba(174,214,255,0.10) 0%, rgba(174,214,255,0.02) 32%, transparent 52%, rgba(174,214,255,0.06) 100%)",
        }}
      />

      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 820px 600px at 50% 46%, rgba(5,32,66,0.10) 0%, rgba(3,20,44,0.72) 62%, rgba(2,13,30,0.94) 100%)",
        }}
      />

      <svg
        aria-hidden
        viewBox="0 0 200 200"
        className="pointer-events-none absolute -top-[46px] -right-[26px] h-[330px] w-[330px] opacity-55"
      >
        <g stroke="#F59008" strokeLinecap="round" fill="none">
          <path d="M34 128 A66 66 0 0 1 166 128" strokeWidth="11" />
          <path d="M100 14 V1" strokeWidth="9" />
          <path d="M153 36 L162 27" strokeWidth="9" />
          <path d="M47 36 L38 27" strokeWidth="9" />
          <path d="M181 90 L194 88" strokeWidth="9" />
          <path d="M19 90 L6 88" strokeWidth="9" />
        </g>
      </svg>

      <div className="relative w-full max-w-[408px]">
        <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_30px_70px_rgba(1,10,26,0.6)]">
          {/* The same horizon that runs under the app bar inside. */}
          <div aria-hidden className="seam" />

          <div className="px-[38px] pt-9 pb-[34px] text-[#0A1A2F]">
            <Image
              src="/brand/bhim-emblem.png"
              alt="BHIM Energy Solutions"
              width={132}
              height={132}
              priority
              className="mx-auto mb-7 h-auto w-[132px]"
            />

            {inactive ? (
              <p className="mb-4 rounded-lg border border-[#ECC97F] bg-[#FFFAED] px-3.5 py-2.5 text-[13px] font-medium text-[#8A5206]">
                {t("inactive")}
              </p>
            ) : null}

            <LoginForm />

            <p className="mt-[18px] text-center text-[13px] font-semibold">
              <a href="/forgot-password" className="text-[#0E4C8A] no-underline">
                {t("forgot")}
              </a>
            </p>
          </div>
        </div>

        <LocaleLinks />
      </div>
    </main>
  );
}
