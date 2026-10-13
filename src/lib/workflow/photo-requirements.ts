import type { PhotoType } from "@/app/actions/photos";

/**
 * The six shots the DISCOM and the national portal both expect after
 * installation.
 *
 * This list is the single source of truth: the stage 4 gate counts how many
 * of these types are covered, and the stage 4 page renders one grid per
 * entry. Adding a seventh requirement is one line, and the gate follows.
 *
 * SITE_SURVEY is deliberately absent — those are taken before the sale, at
 * stage 1, and must not count towards completion here.
 */
export const REQUIRED_PHOTO_TYPES = [
  "CUSTOMER_WITH_PANEL",
  "CUSTOMER_WITH_INVERTER",
  "EARTHING_AC",
  "EARTHING_DC",
  "EARTHING_PIT",
  "SITE_OVERVIEW",
] as const satisfies readonly PhotoType[];

export type RequiredPhotoType = (typeof REQUIRED_PHOTO_TYPES)[number];

export const PHOTO_LABELS: Record<RequiredPhotoType, { label: string; hint: string }> = {
  CUSTOMER_WITH_PANEL: {
    label: "Customer with the panels",
    hint: "The consumer standing with the installed modules behind them",
  },
  CUSTOMER_WITH_INVERTER: {
    label: "Customer with the inverter",
    hint: "The consumer beside the mounted inverter",
  },
  EARTHING_AC: { label: "AC earthing", hint: "The AC side earthing connection" },
  EARTHING_DC: { label: "DC earthing", hint: "The DC side earthing connection" },
  EARTHING_PIT: { label: "Earthing pit", hint: "The pit, with the cover off" },
  SITE_OVERVIEW: {
    label: "Whole array",
    hint: "The complete array from a distance, roof and structure visible",
  },
};
