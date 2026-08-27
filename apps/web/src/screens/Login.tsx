import { useState, type FormEvent } from "react";
import { login } from "../net";

interface LoginProps {
  onSignedIn: () => void;
  onPlayLocal: () => void;
}

export function Login({ onSignedIn, onPlayLocal }: LoginProps) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || passphrase.trim() === "") return;

    setPending(true);
    setError(null);
    try {
      const result = await login(passphrase.trim());
      if (result.ok) onSignedIn();
      else setError(result.error ?? "That did not work.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="login">
      <div className="login-card">
        <p className="eyebrow">Match Monsters</p>
        <h1>Sign in</h1>
        <p className="login-sub">Enter the passphrase from your side of the setup.</p>

        <form onSubmit={submit} className="login-form">
          <label className="sr-only" htmlFor="passphrase">
            Passphrase
          </label>
          <input
            id="passphrase"
            type="password"
            autoComplete="current-password"
            spellCheck={false}
            placeholder="word-word-word-word-00"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            disabled={pending}
          />
          <button type="submit" className="primary" disabled={pending || !passphrase.trim()}>
            {pending ? "Checking…" : "Sign in"}
          </button>
        </form>

        {error && <p className="login-error">{error}</p>}

        <button type="button" className="login-alt" onClick={onPlayLocal}>
          Or play both sides on this device
        </button>
      </div>
    </div>
  );
}
