import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.christen1609.gymlog",
  appName: "Gym Log",
  webDir: "native-shell",
  server: {
    url: "https://gym-log-eight.vercel.app",
    errorPath: "offline.html",
    allowNavigation: [
      "api.notion.com",
      "*.notion.so",
      "notion.so",
      "*.notion.com",
      "*.supabase.co",
    ],
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#000000",
    // Service workers in WKWebView only work for App-Bound Domains (see Info.plist WKAppBoundDomains).
    limitsNavigationsToAppBoundDomains: true,
  },
};

export default config;
