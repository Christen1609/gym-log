"use client";

import { IconSprite } from "@/components/IconSprite";
import { MenuSheet } from "@/components/sheets/MenuSheet";
import { ParseSheet } from "@/components/sheets/ParseSheet";
import { ChatScreen } from "@/components/screens/ChatScreen";
import { ExerciseScreen } from "@/components/screens/ExerciseScreen";
import { ImportScreen } from "@/components/screens/ImportScreen";
import { ProgressScreen } from "@/components/screens/ProgressScreen";
import { SettingsScreen } from "@/components/screens/SettingsScreen";
import { TodayScreen } from "@/components/screens/TodayScreen";
import { SignIn } from "@/components/SignIn";
import { useGymLog } from "@/lib/useGymLog";

export default function Home() {
  const state = useGymLog();

  // Only when Supabase is configured. `null` means the session check hasn't
  // resolved yet — render the empty ground rather than flashing the sign-in
  // screen at an already-signed-in user.
  if (state.authed === null) return <div className="app-shell" data-theme={state.theme} />;
  if (!state.authed) return <SignIn theme={state.theme} />;

  return (
    <div className="app-shell" data-theme={state.theme}>
      <IconSprite />

      {state.screen === "today" && <TodayScreen state={state} />}
      {state.screen === "chat" && <ChatScreen state={state} />}
      {state.screen === "exercise" && <ExerciseScreen state={state} />}
      {state.screen === "progress" && <ProgressScreen state={state} />}
      {state.screen === "import" && <ImportScreen state={state} />}
      {state.screen === "settings" && <SettingsScreen state={state} />}

      {state.sheet === "menu" && <MenuSheet state={state} />}
      {state.sheet === "parse" && <ParseSheet state={state} />}
    </div>
  );
}
