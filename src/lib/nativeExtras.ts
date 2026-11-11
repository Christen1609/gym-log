"use client";

import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { LocalNotifications } from "@capacitor/local-notifications";
import { isNativeApp } from "@/lib/native";

/** The one reminder this app ever has pending; scheduling replaces it. */
const REMINDER_ID = 1;

/** A light tap on save or confirm. Native only; failures are ignored. */
export async function tapHaptic(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* haptics unavailable — nothing to do */
  }
}

/** Replaces the pending reminder with one at `at`. Native only; failures are ignored. */
export async function scheduleReminder(at: Date, dayTitle: string): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: REMINDER_ID,
          title: "Gym Log",
          body: `${dayTitle} is next. Log it when you're done.`,
          schedule: { at },
        },
      ],
    });
  } catch {
    /* scheduling failed — the reminder simply doesn't fire */
  }
}

export async function cancelReminder(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
  } catch {
    /* nothing pending, or plugin unavailable */
  }
}

/** Asks for notification permission. False when not native, or when the lifter says no. */
export async function requestReminderPermission(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const status = await LocalNotifications.requestPermissions();
    return status.display === "granted";
  } catch {
    return false;
  }
}
