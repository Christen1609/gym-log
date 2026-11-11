import { Capacitor } from "@capacitor/core";

/** True only inside the Capacitor iOS shell. Always false on the server and in browsers. */
export function isNativeApp(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}
