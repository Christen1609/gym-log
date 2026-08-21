"use client";

import { IconSprite } from "@/components/IconSprite";
import { Island } from "@/components/Island";
import { MenuSheet } from "@/components/sheets/MenuSheet";
import { ParseSheet } from "@/components/sheets/ParseSheet";
import { ChatScreen } from "@/components/screens/ChatScreen";
import { ExerciseScreen } from "@/components/screens/ExerciseScreen";
import { ImportScreen } from "@/components/screens/ImportScreen";
import { ProgressScreen } from "@/components/screens/ProgressScreen";
import { SettingsScreen } from "@/components/screens/SettingsScreen";
import { SpotifyScreen } from "@/components/screens/SpotifyScreen";
import { TodayScreen } from "@/components/screens/TodayScreen";
import { useGymLog } from "@/lib/useGymLog";

export default function Home() {
  const state = useGymLog();

  return (
    <div className="app-shell" data-theme={state.theme}>
      <IconSprite />
      <Island state={state} />

      {state.screen === "today" && <TodayScreen state={state} />}
      {state.screen === "chat" && <ChatScreen state={state} />}
      {state.screen === "exercise" && <ExerciseScreen state={state} />}
      {state.screen === "progress" && <ProgressScreen state={state} />}
      {state.screen === "spotify" && <SpotifyScreen state={state} />}
      {state.screen === "import" && <ImportScreen state={state} />}
      {state.screen === "settings" && <SettingsScreen state={state} />}

      {state.sheet === "menu" && <MenuSheet state={state} />}
      {state.sheet === "parse" && <ParseSheet state={state} />}
    </div>
  );
}
