import { useEffect, useState } from "react";
import { whoAmI } from "./net";
import { Login } from "./screens/Login";
import { LocalGame } from "./screens/LocalGame";
import { OnlineGame } from "./screens/OnlineGame";

type Mode = "checking" | "login" | "online" | "local";

export default function App() {
  const [mode, setMode] = useState<Mode>("checking");

  useEffect(() => {
    let cancelled = false;
    void whoAmI().then((signedIn) => {
      if (!cancelled) setMode(signedIn ? "online" : "login");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  switch (mode) {
    case "checking":
      return (
        <div className="login">
          <div className="login-card">
            <p className="eyebrow">Match Monsters</p>
            <h1>Loading…</h1>
          </div>
        </div>
      );

    case "online":
      return <OnlineGame onSignedOut={() => setMode("login")} />;

    case "local":
      return <LocalGame onExit={() => setMode("login")} />;

    default:
      return (
        <Login onSignedIn={() => setMode("online")} onPlayLocal={() => setMode("local")} />
      );
  }
}
