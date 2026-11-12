import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "@/lib/native";

export type HealthCardioKind = "run" | "treadmill" | "walk" | "bike" | "cycle" | "row" | string;

export interface SaveWorkoutOptions {
  kind: "strength" | "cardio";
  /** Epoch milliseconds. */
  start: number;
  /** Epoch milliseconds. */
  end: number;
  distanceKm?: number;
  cardioKind?: HealthCardioKind;
}

interface GymLogNativePlugin {
  requestHealth(): Promise<{ granted: boolean }>;
  saveWorkout(opts: SaveWorkoutOptions): Promise<void>;
  setWidgetData(opts: { nextDay: string; daysSince: number | null }): Promise<void>;
}

const GymLogNative = registerPlugin<GymLogNativePlugin>("GymLogNative");

/** Ask iOS for permission to save workouts to Apple Health. Resolves true if allowed. */
export async function requestHealth(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const res = await GymLogNative.requestHealth();
    return !!res.granted;
  } catch (err) {
    console.warn("requestHealth failed", err);
    return false;
  }
}

/** Save a finished workout to Apple Health. Resolves true on success. */
export async function saveWorkoutToHealth(opts: SaveWorkoutOptions): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    await GymLogNative.saveWorkout(opts);
    return true;
  } catch (err) {
    console.warn("saveWorkoutToHealth failed", err);
    return false;
  }
}

/** Share the next day / days-since values with the home-screen widget. */
export async function setWidgetData(nextDay: string, daysSince: number | null): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await GymLogNative.setWidgetData({ nextDay, daysSince });
  } catch (err) {
    console.warn("setWidgetData failed", err);
  }
}
