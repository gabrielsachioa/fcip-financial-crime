import { type FormEvent, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { errorMessage } from "../api/errors";
import { Icon } from "../components/Icon";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  if (loading) {
    return <p className="muted content" role="status">Memeriksa sesi masuk Anda…</p>;
  }
  if (user) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login">
      <section className="login-intro" aria-label="Mengenal FCIP">
        <div className="brand">
          <span className="brand-mark"><Icon name="shield" size={25} /></span>
          <span><strong>FCIP<span className="brand-dot">.</span></strong><small>Peninjauan transaksi</small></span>
        </div>
        <div className="login-intro-copy">
          <span className="eyebrow">KENALI POLANYA. PAHAMI KONTEKSNYA.</span>
          <h2>Setiap temuan punya cerita untuk ditinjau.</h2>
          <p>FCIP membantu Anda melihat aktivitas yang perlu diperhatikan, memahami alasannya, lalu mencatat hasil pemeriksaan.</p>
          <div className="login-flow">
            <div className="login-flow-item"><span>01</span><div><strong>Siapkan transaksi</strong><p>Tambahkan data yang akan diperiksa.</p></div></div>
            <div className="login-flow-item"><span>02</span><div><strong>Pahami temuan</strong><p>Lihat pola yang terdeteksi dan transaksi pendukungnya.</p></div></div>
            <div className="login-flow-item"><span>03</span><div><strong>Tentukan tindak lanjut</strong><p>Catat penilaian atau teruskan untuk pemeriksaan lanjutan.</p></div></div>
          </div>
        </div>
        <p className="login-intro-note"><Icon name="info" size={18} />Sistem memberi petunjuk untuk ditinjau. Setiap keputusan tetap dilakukan oleh manusia.</p>
      </section>
      <section className="login-form-panel">
        <form className="login-card" onSubmit={(e) => void handleSubmit(e)}>
          <div className="login-heading">
            <div className="login-wordmark">
              <span className="brand-mark" aria-hidden="true">
                <Icon name="shield" size={21} />
              </span>
              <strong>FCIP</strong>
            </div>
            <span className="eyebrow">SELAMAT DATANG</span>
            <h1>Masuk ke ruang kerja</h1>
            <p>Gunakan akun Anda untuk mulai meninjau transaksi. Panduan tersedia setelah Anda masuk.</p>
          </div>
          <label>
            Alamat email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              autoFocus
              placeholder="nama@fcip.internal"
              disabled={submitting}
            />
          </label>
          <label>
            Kata sandi
            <div className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="Masukkan kata sandi"
                disabled={submitting}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={
                  showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
                }
                aria-pressed={showPassword}
                onClick={() => setShowPassword(!showPassword)}
              >
                <Icon name={showPassword ? "eye-off" : "eye"} size={19} />
              </button>
            </div>
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="login-submit" disabled={submitting}>
            {submitting ? "Memeriksa akun…" : <>Masuk ke ruang kerja <Icon name="arrow-right" size={17} /></>}
          </button>
          <div className="login-note">
            <p>
              Data demonstrasi dari sumber publik dan simulasi. Sinyal model
              mendukung investigasi; keputusan tetap oleh manusia.
            </p>
          </div>
        </form>
      </section>
    </main>
  );
}
