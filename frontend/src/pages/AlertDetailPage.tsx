import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { disposeAlert, fetchAlert } from "../api/alerts";
import { createCase } from "../api/cases";
import { errorMessage } from "../api/errors";
import { Icon } from "../components/Icon";
import { ModelSignals, SignalNotice } from "../components/ModelSignals";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { alertExplanation } from "../explanations";
import { formatAmount, formatDateTime, formatDetailValue, formatDuration, formatObservedDateTime } from "../format";
import type { AlertDetail, DispositionDecision } from "../types";
import "../review.css";

const MIN_REASON_LENGTH = 20;
const ATTENTION: Record<string, string> = { LOW: "rendah", MEDIUM: "sedang", HIGH: "tinggi", CRITICAL: "kritis" };

export function AlertDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const alertQuery = useQuery({ queryKey: ["alert", id], queryFn: () => fetchAlert(id), enabled: id !== "" });
  const [decision, setDecision] = useState<DispositionDecision>("escalate");
  const [reason, setReason] = useState("");
  const dispose = useMutation({
    mutationFn: () => disposeAlert(id, decision, reason.trim()),
    onSuccess: (updated: AlertDetail) => {
      queryClient.setQueryData(["alert", id], updated);
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
      setReason("");
    },
  });
  const openCase = useMutation({
    mutationFn: () => createCase(id),
    onSuccess: (created) => {
      queryClient.setQueryData(["case", created.id], created);
      void queryClient.invalidateQueries({ queryKey: ["alert", id] });
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
      navigate(`/cases/${created.id}`);
    },
  });

  if (alertQuery.isLoading) return <div className="card empty-state" role="status"><Icon name="clock" size={28} /><h2>Menyiapkan detail temuan…</h2><p>Mengambil alasan penandaan dan transaksi terkait.</p></div>;
  if (alertQuery.error || !alertQuery.data) return <div className="card review-load-error" role="alert"><h1>Detail belum dapat dimuat</h1><p>{errorMessage(alertQuery.error)}</p><button className="button-secondary" type="button" onClick={() => void alertQuery.refetch()}>Coba lagi</button><Link to="/alerts">Kembali ke daftar temuan</Link></div>;
  const alert = alertQuery.data;
  const explanation = alertExplanation(alert);
  const trimmedReason = reason.trim();
  const reasonTooShort = trimmedReason.length < MIN_REASON_LENGTH;
  const canDispose = user?.role === "ROLE_TRIAGE" && alert.status === "OPEN";
  const canOpenCase = alert.status === "ESCALATED" && alert.case_id === null && (user?.role === "ROLE_TRIAGE" || user?.role === "ROLE_INVESTIGATOR");
  const modelPanel = (
    <section className="card" aria-labelledby="review-model-heading">
      <div className="section-head"><div><h2 id="review-model-heading">Apa yang dibaca penilaian otomatis?</h2><p className="muted review-caption">Indikator dan skor yang tersimpan bersama hasil model.</p></div><span className="review-count">{alert.model_signals.length} hasil</span></div>
      <ModelSignals scores={alert.model_signals} notice={alert.signal_notice} />
    </section>
  );
  function submitDisposition(event: FormEvent) {
    event.preventDefault();
    if (canDispose && !reasonTooShort && !dispose.isPending) dispose.mutate();
  }

  return (
    <>
      <Link className="btn-link secondary review-back" to="/alerts"><Icon name="arrow-left" size={16} />Kembali ke daftar temuan</Link>
      <div className="page-header">
        <div><p className="eyebrow">DETAIL PENINJAUAN · {alert.customer_ref}</p><h1>{alert.customer_name}</h1><p className="page-subtitle">Baca alasan penandaan dan transaksi terkait sebelum menentukan tindak lanjut.</p></div>
        <div className="review-header-status"><div className="review-header-badges"><StatusBadge status={alert.status} /><span className={`review-severity review-severity-${alert.rule.severity.toLowerCase()}`}>Perhatian aturan: {ATTENTION[alert.rule.severity] ?? alert.rule.severity}</span></div><p className="review-priority-help">Tingkat perhatian ditentukan aturan, bukan peluang terjadinya fraud.</p></div>
      </div>
      <div className="review-detail-layout">
        <div className="review-main-column">
          <section className="card review-story" aria-labelledby="review-why-heading">
            <div className="review-story-heading"><span className="review-story-icon"><Icon name={alert.pattern_code === "ML_SCORE" ? "activity" : "eye"} size={25} /></span><div><p className="eyebrow">MENGAPA DITANDAI?</p><h2 id="review-why-heading">{explanation.title}</h2></div></div>
            <p className="review-story-description">{explanation.summary}</p>
            <dl className="review-observation-grid">{explanation.observations.map((item, index) => <div className="review-observation" key={`${item.label}-${index}`}><dt>{item.label}</dt><dd>{item.value}{item.help && <small>{item.help}</small>}</dd></div>)}</dl>
            {explanation.limitations.map((text) => <p className="notice review-context-note" key={text}><Icon name="info" size={18} />{text}</p>)}
            <div className="review-guidance-box"><Icon name="search" size={21} /><div><h3>Apa yang perlu Anda periksa?</h3><p>{explanation.hint}</p></div></div>
            <SignalNotice text={alert.signal_notice} />
            <div className="review-summary-meta"><span><Icon name="clock" size={15} />Temuan dibuat {formatDateTime(alert.created_at)}</span><Link to="/guide#istilah">Memahami istilah peninjauan<Icon name="arrow-right" size={15} /></Link></div>
            {(canDispose || canOpenCase) && <a className="btn-link secondary review-jump-action" href="#review-decision">Lanjut ke tindak lanjut<Icon name="arrow-right" size={16} /></a>}
          </section>
          {alert.pattern_code === "ML_SCORE" && modelPanel}
          <section className="card" aria-labelledby="review-transactions-heading">
            <div className="section-head"><div><h2 id="review-transactions-heading">Transaksi yang perlu dicocokkan</h2><p className="muted review-caption">Referensi transaksi pada temuan ini. Daftar ini tidak menyatakan bahwa semua transaksi merupakan pelanggaran.</p></div><span className="review-count">{alert.transactions.length.toLocaleString("id-ID")} transaksi</span></div>
            {alert.transactions.length === 0 ? <div className="empty-state"><h3>Referensi transaksi belum tersedia</h3><p>Gunakan catatan deteksi asli dan hasil penilaian yang tersedia untuk menelusuri temuan.</p></div> : (
              <div className="table-scroll" tabIndex={0} role="region" aria-label="Transaksi yang ditautkan ke temuan">
                <table className="table review-evidence-table"><thead><tr><th>Transaksi dan rekening</th><th>Waktu transaksi</th><th className="num">Nominal</th><th>Arah dana</th><th>Kanal</th><th>Pihak lawan transaksi</th><th>Keterangan</th></tr></thead><tbody>{alert.transactions.map((transaction) => <tr key={transaction.id}>
                  <td><strong className="mono">{transaction.transaction_ref}</strong><div className="review-cell-sub">Rekening {transaction.account_number}</div></td>
                  <td>{formatObservedDateTime(transaction.transaction_date, transaction.timestamp_precision ?? "day", transaction.source_timezone_known ?? false)}</td>
                  <td className="num">{formatAmount(transaction.amount, transaction.currency)}</td>
                  <td><span className={`review-direction ${transaction.direction === "DEBIT" ? "is-outgoing" : "is-incoming"}`}>{transaction.direction === "DEBIT" ? "Keluar" : "Masuk"}</span></td>
                  <td>{transaction.channel}</td><td>{transaction.counterparty_ref ?? "Belum tersedia"}</td><td className="reason-cell">{transaction.description ?? "Tidak ada keterangan"}</td>
                </tr>)}</tbody></table>
              </div>
            )}
            <p className="review-caption muted">Pihak lawan transaksi adalah pengirim atau penerima dana. Kanal adalah cara transaksi dilakukan, misalnya aplikasi atau transfer.</p>
          </section>
          {alert.pattern_code !== "ML_SCORE" && modelPanel}
          <details className="card review-technical">
            <summary><Icon name="layers" size={19} /><span>Catatan asli dan detail teknis deteksi<small>Aturan, parameter dan identitas untuk penelusuran.</small></span></summary>
            <div className="review-technical-body">
              <h3>Catatan deteksi asli</h3><p className="review-original-reason">{alert.reason}</p>
              <h3>Aturan yang digunakan</h3>
              {/* FR-301 AC3 / BR-301.2: retain the stored rule's description verbatim. */}
              <p className="review-rule-description">{alert.rule.description}</p>
              <dl className="facts review-facts">
                <dt>Kode pola</dt><dd className="mono">{alert.pattern_code}</dd>
                <dt>Versi aturan</dt><dd className="mono">{alert.rule.rule_ref} v{alert.rule.version} · {alert.rule.state}</dd>
                <dt>Kode alasan</dt><dd className="mono">{alert.rule.reason_code}</dd>
                <dt>Keparahan pada konfigurasi</dt><dd>{alert.rule.severity}</dd>
                <dt>Periode pemantauan</dt><dd>{formatDuration(alert.rule.window_length)} · {alert.rule.window_type === "ROLLING" ? "rentang waktu bergerak mengikuti aktivitas" : "mengikuti kalender"}</dd>
                <dt>ID temuan</dt><dd className="mono">{alert.id}</dd>
                <dt>ID rangkaian aktivitas</dt><dd className="mono"><Link to={`/audit?correlation_id=${alert.correlation_id}`}>{alert.correlation_id}</Link></dd>
              </dl>
              <p className="review-caption muted">ID rangkaian aktivitas (correlation ID) menghubungkan catatan yang berasal dari proses yang sama. Status aturan di atas adalah status versi yang ditampilkan saat ini.</p>
              <div className="table-scroll" tabIndex={0} role="region" aria-label="Nilai deteksi asli"><table className="table review-factors-table"><caption>Nilai dan parameter asli yang disimpan saat deteksi</caption><tbody>{Object.entries(alert.detection_details).map(([key, value]) => <tr key={key}><th className="mono">{key}</th><td className="mono review-factor-value">{formatDetailValue(value)}</td></tr>)}</tbody></table></div>
            </div>
          </details>
        </div>
        <aside id="review-decision" className="review-decision-column" aria-label="Tindak lanjut peninjauan">
          <section className="card review-decision-card">
            <span className="review-step-label">LANGKAH BERIKUTNYA</span><h2>Tentukan tindak lanjut</h2>
            {alert.status !== "OPEN" ? <>
              <div className="review-recorded-decision" role="status"><Icon name="check" size={22} /><strong>{alert.status === "ESCALATED" ? "Diteruskan untuk pemeriksaan lanjutan" : "Tinjauan diselesaikan tanpa diteruskan"}</strong></div>
              <dl className="facts review-facts"><dt>Ditinjau oleh</dt><dd>{alert.disposed_by_email ?? "Tidak dicantumkan"}</dd><dt>Waktu tinjauan</dt><dd>{formatDateTime(alert.disposed_at)}</dd></dl>
              <div className="review-recorded-reason"><span className="eyebrow">ALASAN PENINJAU</span><p>{alert.disposition_reason ?? "Tidak dicantumkan"}</p></div>
            </> : canDispose ? (
              <form onSubmit={submitDisposition} className="stack">
                <p className="muted review-caption">Setelah memeriksa transaksi dan konteksnya, pilih satu keputusan. Keputusan dan alasan Anda akan tercatat.</p>
                <fieldset className="review-decisions" disabled={dispose.isPending}><legend>Hasil tinjauan Anda</legend>
                  <label className={`review-choice ${decision === "escalate" ? "review-choice-selected" : ""}`}><input type="radio" name="decision" value="escalate" checked={decision === "escalate"} onChange={() => setDecision("escalate")} /><span><strong>Periksa lebih lanjut</strong><small>Teruskan temuan agar dapat ditangani dalam pemeriksaan lanjutan.</small></span></label>
                  <label className={`review-choice ${decision === "false_positive" ? "review-choice-selected" : ""}`}><input type="radio" name="decision" value="false_positive" checked={decision === "false_positive"} onChange={() => setDecision("false_positive")} /><span><strong>Tidak perlu dilanjutkan</strong><small>Catat alasan aktivitas yang ditandai dapat dijelaskan. Ini dicatat sebagai false positive.</small></span></label>
                </fieldset>
                <label htmlFor="disposition-reason">Apa dasar keputusan Anda?<textarea disabled={dispose.isPending} id="disposition-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={5} placeholder="Jelaskan transaksi yang diperiksa, informasi pendukung, dan alasan tindak lanjut…" aria-describedby="reason-guidance" aria-invalid={reason.length > 0 && reasonTooShort} /></label>
                <div id="reason-guidance" className="review-reason-guidance"><span>Minimal {MIN_REASON_LENGTH} karakter setelah spasi tepi dihapus.</span><span className={reasonTooShort ? "muted" : "ok"} aria-live="polite">{trimmedReason.length}/{MIN_REASON_LENGTH}</span></div>
                {dispose.error && <p className="error" role="alert">{errorMessage(dispose.error)}</p>}
                <button type="submit" disabled={reasonTooShort || dispose.isPending}>{dispose.isPending ? "Menyimpan keputusan…" : "Simpan hasil tinjauan"}<Icon name="arrow-right" size={16} /></button>
              </form>
            ) : <div className="review-read-only"><Icon name="shield" size={25} /><p>Anda dapat membaca temuan ini. Keputusan tinjauan awal dicatat oleh petugas peninjau temuan (Triage Analyst).</p><Link to="/guide#istilah">Apa arti peran peninjau?</Link></div>}
            {alert.case_id && <Link className="btn-link review-linked-case" to={`/cases/${alert.case_id}`}><Icon name="file" size={17} />Buka pemeriksaan terkait<Icon name="arrow-right" size={16} /></Link>}
            {canOpenCase && <div className="review-case-action"><h3>Mulai pemeriksaan lanjutan</h3><p className="muted">Temuan sudah diteruskan. Buat satu berkas pemeriksaan (case) untuk mengumpulkan temuan terkait.</p>{openCase.error && <p className="error" role="alert">{errorMessage(openCase.error)}</p>}<button type="button" onClick={() => openCase.mutate()} disabled={openCase.isPending}><Icon name="file" size={17} />{openCase.isPending ? "Membuat pemeriksaan…" : "Buat pemeriksaan lanjutan"}</button></div>}
          </section>
          <section className="review-next-help"><Icon name="info" size={21} /><h3>Keputusan tetap pada manusia</h3><p>Temuan dan skor membantu memilih aktivitas untuk diperiksa. Aplikasi ini tidak memblokir atau membekukan dana.</p><Link to={`/audit?correlation_id=${alert.correlation_id}`}>Lihat riwayat aktivitas<Icon name="arrow-right" size={15} /></Link></section>
        </aside>
      </div>
    </>
  );
}
