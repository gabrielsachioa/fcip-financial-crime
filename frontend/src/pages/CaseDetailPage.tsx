import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { fetchCase } from "../api/cases";
import { errorMessage } from "../api/errors";
import { Icon } from "../components/Icon";
import { SignalNotice, SIGNAL_NOTICE } from "../components/Notices";
import { StatusBadge } from "../components/StatusBadge";
import { patternSummary, patternTitle } from "../explanations";
import { formatDateTime } from "../format";
import type { CaseStatus } from "../types";
import "../review.css";

const CASE_HELP: Record<CaseStatus, string> = {
  OPEN: "Berkas pemeriksaan telah dibuat. Buka temuan terkait untuk memahami informasi yang perlu diperiksa.",
  IN_PROGRESS: "Pemeriksaan sedang berlangsung. Baca temuan terkait dan riwayat aktivitas untuk mengikuti penanganannya.",
  PENDING_CLOSURE: "Penutupan telah diajukan dan menunggu pemeriksaan oleh pihak yang berwenang.",
  CLOSED: "Pemeriksaan sudah ditutup. Temuan dan riwayatnya tetap dapat dibaca.",
  REOPENED: "Berkas pemeriksaan telah dibuka kembali untuk ditindaklanjuti.",
  ESCALATED: "Pemeriksaan telah diteruskan untuk penanganan berikutnya.",
  REFERRED: "Pemeriksaan telah dirujuk untuk penanganan berikutnya.",
};

export function CaseDetailPage() {
  const { id = "" } = useParams();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["case", id], queryFn: () => fetchCase(id), enabled: id !== "" });
  if (isLoading) return <div className="card empty-state" role="status"><Icon name="clock" size={28} /><h2>Menyiapkan berkas pemeriksaan…</h2><p>Mengambil ringkasan dan temuan yang terkait.</p></div>;
  if (error || !data) return <div className="card review-load-error" role="alert"><h1>Pemeriksaan belum dapat dimuat</h1><p>{errorMessage(error)}</p><button type="button" className="button-secondary" onClick={() => void refetch()}>Coba lagi</button><Link to="/alerts">Kembali ke daftar temuan</Link></div>;

  return (
    <>
      <Link className="btn-link secondary review-back" to="/alerts"><Icon name="arrow-left" size={16} />Kembali ke daftar temuan</Link>
      <div className="page-header"><div><p className="eyebrow">PEMERIKSAAN LANJUTAN</p><h1>{data.case_number}</h1><p className="page-subtitle">Satu berkas untuk menelusuri temuan yang memerlukan pemeriksaan lebih lanjut.</p></div><StatusBadge status={data.status} kind="case" /></div>
      <div className="review-case-overview">
        <section className="card review-case-story"><span className="review-story-icon"><Icon name="file" size={27} /></span><div><h2>Posisi pemeriksaan saat ini</h2><p>{CASE_HELP[data.status]}</p><dl className="review-case-meta"><div><dt>Dibuka oleh</dt><dd>{data.opened_by_email}</dd></div><div><dt>Penugasan</dt><dd>{data.assigned_to ? "Sudah ditugaskan ke petugas" : "Belum ditugaskan"}</dd></div><div><dt>Terakhir diperbarui</dt><dd>{formatDateTime(data.updated_at)}</dd></div></dl></div></section>
        <section className="card review-case-history"><Icon name="history" size={24} /><h2>Ikuti jejak penanganan</h2><p>Riwayat aktivitas mencatat perubahan status dan tindakan agar keputusan dapat ditelusuri.</p><Link className="btn-link secondary" to={`/audit?correlation_id=${data.correlation_id}`}>Buka riwayat pemeriksaan<Icon name="arrow-right" size={16} /></Link></section>
      </div>
      <section className="card" aria-labelledby="case-findings-heading">
        <div className="section-head"><div><h2 id="case-findings-heading">Temuan dalam pemeriksaan ini</h2><p className="muted">Buka temuan untuk membaca alasan penandaan, transaksi dan catatan peninjau.</p></div><span className="review-count">{data.alerts.length.toLocaleString("id-ID")} temuan</span></div>
        {data.alerts.length === 0 ? <div className="empty-state"><Icon name="file" size={28} /><h3>Belum ada temuan terkait</h3><p>Temuan yang ditautkan akan tampil di bagian ini.</p></div> : (
          <ol className="review-finding-list">{data.alerts.map((alert) => <li key={alert.id}><article className="review-finding">
            <div className="review-finding-icon"><Icon name="eye" size={21} /></div>
            <div className="review-finding-main"><div className="review-finding-meta"><span>{alert.customer_name}</span><StatusBadge status={alert.status} /></div><Link className="review-finding-title" to={`/alerts/${alert.id}`}>{patternTitle(alert.pattern_code)}</Link><p>{patternSummary(alert.pattern_code)}</p><div className="review-finding-foot"><span>{alert.customer_ref}</span><span>Dibuat {formatDateTime(alert.created_at)}</span></div></div>
            <Link className="btn-link review-investigate" to={`/alerts/${alert.id}`} aria-label={`Buka temuan untuk ${alert.customer_name}`}>Buka temuan<Icon name="arrow-right" size={17} /></Link>
          </article></li>)}</ol>
        )}
        <SignalNotice text={SIGNAL_NOTICE} />
      </section>
      <details className="card review-technical"><summary><Icon name="layers" size={19} /><span>Identitas dan referensi pemeriksaan<small>Detail untuk penelusuran oleh petugas.</small></span></summary><div className="review-technical-body"><dl className="facts review-facts"><dt>ID pemeriksaan</dt><dd className="mono">{data.id}</dd><dt>ID petugas yang ditugaskan</dt><dd className="mono">{data.assigned_to ?? "Belum ditugaskan"}</dd><dt>Status asli</dt><dd className="mono">{data.status}</dd><dt>Waktu dibuat</dt><dd>{formatDateTime(data.created_at)}</dd><dt>ID rangkaian aktivitas</dt><dd className="mono">{data.correlation_id}</dd></dl><p className="review-caption muted">ID rangkaian aktivitas (correlation ID) membantu menemukan catatan yang berasal dari proses yang sama.</p></div></details>
    </>
  );
}
