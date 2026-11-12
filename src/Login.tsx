import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { User } from "../shared/types";

declare global { interface Window { google?: any } }

export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const btn = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [dev, setDev] = useState<boolean>(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.config().then((cfg) => {
      if (cancelled) return;
      setDev(cfg.devAuth);
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => {
        window.google?.accounts.id.initialize({
          client_id: cfg.googleClientId,
          callback: async (resp: { credential: string }) => {
            try { onLogin(await api.loginGoogle(resp.credential)); }
            catch (e: any) { setError(e.message); }
          },
        });
        if (btn.current) window.google?.accounts.id.renderButton(btn.current, { theme: "outline", size: "large", text: "signin_with", width: 280 });
      };
      document.head.appendChild(s);
    });
    return () => { cancelled = true; };
  }, [onLogin]);

  return (
    <main className="login">
      <h1>💸 Gastos</h1>
      <p className="muted">Gastos compartidos, solo para nosotros dos.</p>
      <div ref={btn} className="gbtn" />
      {error && <p className="error">{error}</p>}
      {dev && (
        <form className="devlogin" onSubmit={async (e) => {
          e.preventDefault();
          try { onLogin(await api.loginDev(email)); } catch (err: any) { setError(err.message); }
        }}>
          <small className="muted">Modo desarrollo</small>
          <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn">Entrar</button>
        </form>
      )}
    </main>
  );
}
