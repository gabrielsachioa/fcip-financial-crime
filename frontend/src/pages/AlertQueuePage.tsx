import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { fetchAlerts } from "../api/alerts";
import { errorMessage } from "../api/errors";
import { Icon } from "../components/Icon";
import { SignalNotice, SIGNAL_NOTICE } from "../components/Notices";
import { StatusBadge } from "../components/StatusBadge";
import { patternSummary, patternTitle } from "../explanations";
import { formatDateTime } from "../format";
import type { AlertStatus } from "../types";
import "../review.css";

const STATUS_OPTIONS: { value: AlertStatus | ""; label: string }[] = [
  { value: "OPEN", label: "Menunggu tinjauan" },
  { value: "ESCALATED", label: "Pemeriksaan lanjutan" },
  { value: "DISPOSED", label: "Selesai ditinjau" },
  { value: "", label: "Semua temuan" },
];
const PAGE_SIZE = 25;

export function AlertQueuePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedStatus = searchParams.get("status");
  const status: AlertStatus | "" = STATUS_OPTIONS.some((option) => option.value === requestedStatus)
    ? requestedStatus as AlertStatus | "" : "OPEN";
  const [offset, setOffset] = useState(0);
  function setStatus(next: AlertStatus | "") {
    setSearchParams((current) => {
      const updated = new URLSearchParams(current);
      updated.set("status", next);
      return updated;
    });
    setOffset(0);
  }
  useEffect(() => setOffset(0), [status]);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["alerts", status, offset],
    queryFn: () => fetchAlerts(status || undefined, { limit: PAGE_SIZE, offset }),
  });
  useEffect(() => {
    if (data && offset > 0 && offset >= data.total) {
      setOffset(Math.max(0, Math.floor((data.total - 1) / PAGE_SIZE) * PAGE_SIZE));
    }
  }, [data, offset]);

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">TINJAUAN TRANSAKSI</p>
          <h1>Perlu ditinjau</h1>
          <p className="page-subtitle">Pahami mengapa aktivitas ditandai, periksa transaksinya, lalu catat tindak lanjut.</p>
        </div>
        <Link className="btn-link secondary" to="/guide#meninjau">Cara meninjau temuan <Icon name="arrow-right" size={16} /></Link>
      </div>
      <div className="review-intro-strip">
        <span className="review-intro-icon"><Icon name="eye" size={24} /></span>
        <div><strong>Ditandai berarti perlu diperiksa.</strong><p>Aktivitas yang sah juga dapat memenuhi pola deteksi. Keputusan dibuat setelah seseorang memeriksa konteksnya.</p></div>
      </div>
      <section className="card review-queue-card" aria-labelledby="review-list-heading">
        <div className="section-head">
          <div><h2 id="review-list-heading">Daftar temuan</h2>{data && <p className="muted">{data.total.toLocaleString("id-ID")} temuan sesuai filter</p>}</div>
          {isFetching && !isLoading && <span className="muted" role="status">Memperbarui…</span>}
        </div>
        <div className="review-status-filters" role="group" aria-label="Filter status temuan">
          {STATUS_OPTIONS.map((option) => <button key={option.value} type="button" className={`button-secondary ${status === option.value ? "is-selected" : ""}`} aria-pressed={status === option.value} onClick={() => { setStatus(option.value); setOffset(0); }}>{option.label}</button>)}
        </div>
        {isLoading && <div className="empty-state" role="status"><Icon name="clock" size={28} /><h3>Menyiapkan daftar temuan…</h3><p>Menunggu data peninjauan.</p></div>}
        {error && <div className="review-load-error" role="alert"><h3>Daftar belum dapat dimuat</h3><p>{errorMessage(error)}</p><button type="button" className="button-secondary" disabled={isFetching} onClick={() => void refetch()}>Coba lagi</button></div>}
        {data && data.items.length === 0 && <div className="empty-state"><Icon name="check" size={30} /><h3>Belum ada temuan pada filter ini</h3><p>Coba lihat status lain. Hasil kosong tidak menyatakan bahwa semua transaksi telah dinilai normal.</p>{status !== "" && <button type="button" className="button-secondary" onClick={() => { setStatus(""); setOffset(0); }}>Lihat semua temuan</button>}</div>}
        {data && data.items.length > 0 && <>
          <ol className="review-finding-list">
            {data.items.map((alert) => <li key={alert.id}>
              <article className="review-finding">
                <div className="review-finding-icon"><Icon name={alert.pattern_code === "ML_SCORE" ? "activity" : "eye"} size={21} /></div>
                <div className="review-finding-main">
                  <div className="review-finding-meta"><span>{alert.customer_name}</span><StatusBadge status={alert.status} /></div>
                  <Link to={`/alerts/${alert.id}`} className="review-finding-title">{patternTitle(alert.pattern_code)}</Link>
                  <p>{patternSummary(alert.pattern_code)}</p>
                  <div className="review-finding-foot"><span>{alert.customer_ref}</span><span>Dibuat {formatDateTime(alert.created_at)}</span>{alert.case_id && <Link to={`/cases/${alert.case_id}`}>Lihat pemeriksaan terkait</Link>}</div>
                </div>
                <Link className="btn-link review-investigate" to={`/alerts/${alert.id}`} aria-label={`Tinjau ${patternTitle(alert.pattern_code)} untuk ${alert.customer_name}`}>Tinjau temuan <Icon name="arrow-right" size={17} /></Link>
              </article>
            </li>)}
          </ol>
          <div className="pager review-pager" aria-label="Halaman daftar temuan">
            <span className="muted" aria-live="polite">Menampilkan {(data.offset + 1).toLocaleString("id-ID")}–{(data.offset + data.items.length).toLocaleString("id-ID")} dari {data.total.toLocaleString("id-ID")} temuan</span>
            <div className="review-pager-controls">
              <button type="button" className="button-secondary" disabled={offset === 0 || isFetching} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} aria-label="Halaman temuan sebelumnya"><Icon name="arrow-left" size={15} />Sebelumnya</button>
              <button type="button" className="button-secondary" disabled={offset + PAGE_SIZE >= data.total || isFetching} onClick={() => setOffset(offset + PAGE_SIZE)} aria-label="Halaman temuan berikutnya">Berikutnya<Icon name="arrow-right" size={15} /></button>
            </div>
          </div>
        </>}
        <SignalNotice text={SIGNAL_NOTICE} />
      </section>
    </>
  );
}
