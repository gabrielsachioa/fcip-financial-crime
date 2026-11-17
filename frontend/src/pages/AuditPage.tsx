import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";

import { exportAudit, searchAudit } from "../api/audit";
import { errorMessage } from "../api/errors";
import { Icon } from "../components/Icon";
import { formatDateTime } from "../format";
import type { AuditEvent, AuditFilters } from "../types";
import "../operations.css";

const PAGE_SIZE = 50;
const OBJECT_TYPES = [
  "ALERT",
  "CASE",
  "BATCH",
  "DETECTION_RUN",
  "AUDIT_EXPORT",
  "RULE_VERSION",
  "MODEL_VERSION",
];
const FILTER_KEYS = [
  "correlation_id",
  "object_type",
  "object_id",
  "actor_email",
] as const;
const FILTER_LABELS: Record<(typeof FILTER_KEYS)[number], string> = {
  correlation_id: "ID rangkaian aktivitas",
  object_type: "Jenis catatan",
  object_id: "ID catatan",
  actor_email: "Email pelaksana",
};
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readFilters(params: URLSearchParams): Required<AuditFilters> {
  return {
    correlation_id: params.get("correlation_id") ?? "",
    object_type: params.get("object_type") ?? "",
    object_id: params.get("object_id") ?? "",
    actor_email: params.get("actor_email") ?? "",
  };
}

/** FR-1105: applied filters and pagination stay in the URL for a shareable audit chain. */
export function AuditPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => readFilters(searchParams), [searchParams]);
  const [draft, setDraft] = useState(() => readFilters(searchParams));
  const [validationError, setValidationError] = useState("");
  const offsetValue = Number(searchParams.get("offset") ?? "0");
  const offset =
    Number.isSafeInteger(offsetValue) && offsetValue >= 0 ? offsetValue : 0;

  useEffect(() => {
    setDraft(filters);
    setValidationError("");
  }, [filters]);

  const audit = useQuery({
    queryKey: ["audit", filters, offset],
    queryFn: () => searchAudit(filters, { limit: PAGE_SIZE, offset }),
    placeholderData: keepPreviousData,
  });
  const download = useMutation({
    mutationFn: () => exportAudit(filters),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
  const total = audit.data?.total ?? 0;
  const shownOffset = audit.data?.offset ?? offset;
  const activeFilters = FILTER_KEYS.filter((key) => filters[key] !== "");
  const hasDraftChanges = FILTER_KEYS.some(
    (key) => draft[key] !== filters[key],
  );

  useEffect(() => {
    if (
      !audit.data ||
      audit.isPlaceholderData ||
      offset === 0 ||
      offset < audit.data.total
    )
      return;
    const next = new URLSearchParams(searchParams);
    const lastOffset = Math.max(
      0,
      Math.floor((audit.data.total - 1) / PAGE_SIZE) * PAGE_SIZE,
    );
    if (lastOffset) next.set("offset", String(lastOffset));
    else next.delete("offset");
    setSearchParams(next, { replace: true });
  }, [
    audit.data,
    audit.isPlaceholderData,
    offset,
    searchParams,
    setSearchParams,
  ]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    for (const key of ["correlation_id", "object_id"] as const) {
      if (draft[key].trim() && !UUID_PATTERN.test(draft[key].trim())) {
        setValidationError(`${FILTER_LABELS[key]} perlu disalin lengkap dalam format ID 36 karakter (UUID). Buka rincian aktivitas untuk menyalin ID yang sesuai.`);
        return;
      }
    }
    const next = new URLSearchParams(searchParams);
    for (const key of FILTER_KEYS) {
      const value = draft[key].trim();
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("offset");
    setSearchParams(next, { replace: true });
    setValidationError("");
    download.reset();
  }

  function resetFilters() {
    setSearchParams(new URLSearchParams(), { replace: true });
    setDraft({
      correlation_id: "",
      object_type: "",
      object_id: "",
      actor_email: "",
    });
    setValidationError("");
    download.reset();
  }

  function changePage(value: number) {
    const next = new URLSearchParams(searchParams);
    if (value === 0) next.delete("offset");
    else next.set("offset", String(value));
    setSearchParams(next);
  }

  return (
    <div className="operations-page ops-audit-page">
      <div className="page-header">
        <div>
          <span className="ops-eyebrow">Jejak pekerjaan</span>
          <h1>Riwayat aktivitas</h1>
          <p>Lihat siapa melakukan apa dan kapan. Setiap catatan membantu menelusuri proses pemeriksaan.</p>
        </div>
        <button type="button" className="button-secondary" onClick={() => download.mutate()} disabled={download.isPending}>
          <Icon name="file" size={17} />{download.isPending ? "Menyiapkan unduhan…" : "Unduh riwayat (CSV)"}
        </button>
      </div>

      <div className="ops-audit-intro"><span className="ops-welcome-symbol"><Icon name="history" size={24} /></span><div><h2>Telusuri langkah yang sudah tercatat</h2><p>Riwayat ini berisi catatan proses, seperti penambahan data dan peninjauan temuan. Catatan aktivitas tidak menyatakan bahwa suatu transaksi adalah kejahatan.</p></div><Link to="/guide">Pelajari istilah <Icon name="arrow-right" size={15} /></Link></div>

      <section className="card ops-audit-filters" aria-labelledby="audit-filter-heading">
        <div className="section-head"><div><h2 id="audit-filter-heading">Cari aktivitas</h2><p>Biarkan pilihan kosong untuk melihat semua catatan yang tersedia.</p></div><span className="badge badge-neutral">{activeFilters.length ? `${activeFilters.length} penyaring dipakai` : "Semua aktivitas"}</span></div>
        <form onSubmit={applyFilters} noValidate>
          <div className="ops-audit-primary-filters">
            <label>Jenis catatan<select value={draft.object_type} onChange={(event) => setDraft({ ...draft, object_type: event.target.value })}><option value="">Semua jenis catatan</option>{draft.object_type && !OBJECT_TYPES.includes(draft.object_type) && <option value={draft.object_type}>{objectLabel(draft.object_type)}</option>}{OBJECT_TYPES.map((type) => <option key={type} value={type}>{objectLabel(type)}</option>)}</select><small>Pilih proses yang ingin dilihat, misalnya temuan atau unggahan data.</small></label>
            <label>Dilakukan oleh<input value={draft.actor_email} onChange={(event) => setDraft({ ...draft, actor_email: event.target.value })} placeholder="Email pengguna, jika diketahui" autoCapitalize="none" spellCheck={false} /><small>Cocokkan dengan email pelaksana yang tercatat.</small></label>
          </div>
          <details className="ops-disclosure ops-audit-technical-filters" open={Boolean(filters.correlation_id || filters.object_id) || undefined}>
            <summary>Telusuri catatan tertentu dengan ID <span>lanjutan</span></summary>
            <p className="muted small">ID adalah penanda unik sebuah catatan. ID rangkaian menghubungkan beberapa aktivitas dalam proses yang sama. Salin lengkap dari rincian aktivitas atau tautan yang dibagikan.</p>
            <div className="ops-audit-primary-filters">
              <label>ID rangkaian aktivitas<input aria-label="ID rangkaian aktivitas" value={draft.correlation_id} onChange={(event) => setDraft({ ...draft, correlation_id: event.target.value })} placeholder="Salin ID rangkaian lengkap" maxLength={36} spellCheck={false} aria-describedby={validationError ? "audit-filter-error" : undefined} /></label>
              <label>ID catatan<input value={draft.object_id} onChange={(event) => setDraft({ ...draft, object_id: event.target.value })} placeholder="Salin ID temuan, kasus, atau unggahan" maxLength={36} spellCheck={false} aria-describedby={validationError ? "audit-filter-error" : undefined} /></label>
            </div>
          </details>
          {validationError && <p className="error" id="audit-filter-error" role="alert">{validationError}</p>}
          <div className="ops-audit-filter-actions"><button type="submit"><Icon name="search" size={16} />Tampilkan aktivitas</button><button type="button" className="button-secondary" onClick={resetFilters} disabled={!activeFilters.length && !hasDraftChanges && offset === 0}>Hapus penyaring</button>{hasDraftChanges && <span className="muted small">Pilihan berubah. Tekan Tampilkan aktivitas untuk menerapkannya.</span>}</div>
        </form>
      </section>

      {download.error && <div className="error" role="alert">Riwayat belum dapat diunduh. {errorMessage(download.error)}</div>}
      {download.isSuccess && <div className="ops-note ops-success" role="status"><Icon name="check" size={18} /><span>File CSV sudah diunduh. Pengunduhan ini juga dicatat di riwayat aktivitas.</span></div>}

      <section className="card ops-audit-events" aria-labelledby="audit-events-heading" aria-busy={audit.isFetching}>
        <div className="section-head"><div><h2 id="audit-events-heading">Aktivitas yang tercatat</h2><p>Diurutkan dari yang paling awal agar rangkaian proses mudah diikuti.</p></div>{audit.data && <span className="badge badge-blue" aria-live="polite" aria-atomic="true">{audit.isPlaceholderData ? "Memperbarui aktivitas…" : `${total.toLocaleString("id-ID")} aktivitas ditemukan`}</span>}</div>
        {activeFilters.length > 0 && <div className="ops-applied-filters" aria-label="Penyaring yang sedang dipakai">{activeFilters.map((key) => <span key={key}><strong>{FILTER_LABELS[key]}:</strong> {key === "object_type" ? objectLabel(filters[key]) : filters[key]}</span>)}</div>}
        {(audit.isPending || audit.isPlaceholderData) && <div className="ops-audit-loading" role="status"><span className="spinner" />Memuat riwayat aktivitas…</div>}
        {audit.error && <div className="error" role="alert"><p>Riwayat belum dapat ditampilkan. {errorMessage(audit.error)}</p><button type="button" className="button-secondary" onClick={() => void audit.refetch()}>Coba lagi</button></div>}
        {audit.data && !audit.isPlaceholderData && audit.data.items.length === 0 && <div className="empty-state"><Icon name="history" size={30} /><h3>{activeFilters.length ? "Belum ada aktivitas yang sesuai" : "Belum ada aktivitas tercatat"}</h3><p>{activeFilters.length ? "Coba pilih jenis catatan lain atau hapus penyaring untuk melihat seluruh riwayat." : "Aktivitas akan muncul saat data ditambahkan dan pekerjaan pemeriksaan dilakukan."}</p>{activeFilters.length > 0 && <button type="button" className="button-secondary" onClick={resetFilters}>Lihat semua aktivitas</button>}</div>}
        {audit.data && !audit.isPlaceholderData && audit.data.items.length > 0 && <ol className="ops-activity-list">{audit.data.items.map((event) => <li key={event.id}>
          <span className="ops-activity-marker" aria-hidden="true"><Icon name={event.object_type === "ALERT" ? "alert" : event.object_type === "CASE" ? "file" : event.object_type === "BATCH" ? "upload" : "history"} size={18} /></span>
          <article className="ops-activity-card">
            <div className="ops-activity-top"><span className="ops-eyebrow">{objectLabel(event.object_type)}</span><time dateTime={event.created_at}>{formatDateTime(event.created_at)}</time></div>
            <h3>{activityTitle(event)}</h3>
            <p className="ops-activity-actor"><strong>{event.actor_email ?? "Proses sistem"}</strong>{event.actor_role && <span> · {roleLabel(event.actor_role)}</span>}</p>
            <div className="ops-state-change" aria-label={`Status berubah dari ${event.from_state ? stateLabel(event.from_state) : "belum ada"} menjadi ${stateLabel(event.to_state)}`}><span>{event.from_state ? stateLabel(event.from_state) : "Baru dibuat"}</span><Icon name="arrow-right" size={14} /><strong>{stateLabel(event.to_state)}</strong></div>
            {event.reason && <div className="ops-activity-reason"><span>Catatan yang tersimpan</span><p>{event.reason}</p></div>}
            <div className="ops-activity-footer"><Link to={`/audit?correlation_id=${event.correlation_id}`} aria-label={`Lihat rangkaian aktivitas terkait ${objectLabel(event.object_type)} pada ${formatDateTime(event.created_at)}`}>Lihat rangkaian terkait <Icon name="arrow-right" size={14} /></Link><details className="ops-inline-details"><summary>ID & rincian teknis</summary><dl className="ops-detail-list"><dt>ID catatan</dt><dd className="mono">{event.object_id}</dd><dt>ID rangkaian aktivitas</dt><dd className="mono">{event.correlation_id}</dd><dt>Jenis catatan dari sistem</dt><dd className="mono">{event.object_type}</dd><dt>Perubahan status dari sistem</dt><dd className="mono">{event.from_state ?? "(belum ada)"} → {event.to_state}</dd>{event.actor_role && <><dt>Kode peran pelaksana</dt><dd className="mono">{event.actor_role}</dd></>}</dl></details></div>
          </article>
        </li>)}</ol>}
        {audit.data && !audit.isPlaceholderData && audit.data.items.length > 0 && <div className="pager ops-audit-pagination"><span className="muted">Menampilkan {(shownOffset + 1).toLocaleString("id-ID")}–{Math.min(shownOffset + PAGE_SIZE, total).toLocaleString("id-ID")} dari {total.toLocaleString("id-ID")} aktivitas{audit.isFetching && " · memperbarui…"}</span><div className="inline-controls"><button type="button" className="button-secondary" onClick={() => changePage(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0 || audit.isFetching}><Icon name="arrow-left" size={16} />Sebelumnya</button><button type="button" className="button-secondary" onClick={() => changePage(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total || audit.isFetching}>Berikutnya<Icon name="arrow-right" size={16} /></button></div></div>}
        <p className="ops-data-footnote"><Icon name="info" size={17} /><span>Unduhan CSV mengikuti penyaring yang sudah diterapkan. Catatan disimpan untuk penelusuran proses dan tidak dapat diedit dari halaman ini.</span></p>
      </section>
    </div>
  );
}

function objectLabel(value: string): string {
  return ({ ALERT: "Temuan", CASE: "Kasus pemeriksaan", BATCH: "Unggahan data", DETECTION_RUN: "Pemeriksaan otomatis", AUDIT_EXPORT: "Unduhan riwayat", RULE_VERSION: "Aturan pemeriksaan", MODEL_VERSION: "Model pemeriksaan" } as Record<string, string>)[value] ?? value.replace(/_/g, " ");
}

function stateLabel(value: string): string {
  return ({ OPEN: "Menunggu ditinjau", DISPOSED: "Peninjauan diselesaikan", ESCALATED: "Diteruskan", IN_PROGRESS: "Sedang diperiksa", PENDING_CLOSURE: "Penutupan diajukan", CLOSED: "Ditutup", REOPENED: "Dibuka kembali", REFERRED: "Dirujuk", REGISTERED: "Terdaftar", COMPLETED: "Selesai diproses", NEEDS_REVIEW: "Perlu diperiksa", FAILED: "Gagal diproses", EXPORTED: "Sudah diunduh", DRAFT: "Draf", ACTIVE: "Diaktifkan", PENDING_APPROVAL: "Menunggu persetujuan", IN_SIMULATION: "Sedang diuji", SUSPENDED: "Dihentikan sementara", RETIRED: "Tidak digunakan lagi" } as Record<string, string>)[value] ?? value.replace(/_/g, " ");
}

function roleLabel(value: string): string {
  return ({ ROLE_DATA_OPS: "Pengelola data", ROLE_ANALYST: "Analis", ROLE_TRIAGE: "Peninjau temuan", ROLE_INVESTIGATOR: "Pemeriksa kasus", ROLE_SENIOR_INVESTIGATOR: "Pemeriksa senior", ROLE_MLRO: "Penanggung jawab kepatuhan", ROLE_AUDITOR: "Auditor internal", ROLE_MANAGEMENT: "Manajemen", ROLE_ADMIN: "Administrator" } as Record<string, string>)[value] ?? "Peran tercatat";
}

function activityTitle(event: AuditEvent): string {
  if (event.object_type === "BATCH") return ({ REGISTERED: "File transaksi didaftarkan", COMPLETED: "File transaksi selesai dibaca", NEEDS_REVIEW: "Hasil unggahan memerlukan pemeriksaan", FAILED: "Pemrosesan unggahan gagal" } as Record<string, string>)[event.to_state] ?? `Unggahan: ${stateLabel(event.to_state)}`;
  if (event.object_type === "DETECTION_RUN" && event.to_state === "COMPLETED") return "Pemeriksaan transaksi selesai";
  if (event.object_type === "AUDIT_EXPORT") return "Riwayat aktivitas diunduh";
  if (event.object_type === "ALERT") {
    if (event.to_state === event.from_state) return "Catatan temuan diperbarui";
    return ({ OPEN: "Temuan baru menunggu peninjauan", DISPOSED: "Peninjauan temuan diselesaikan", ESCALATED: "Temuan diteruskan untuk pemeriksaan lanjutan" } as Record<string, string>)[event.to_state] ?? `Temuan: ${stateLabel(event.to_state)}`;
  }
  if (event.object_type === "CASE") return event.to_state === event.from_state ? "Catatan kasus diperbarui" : ({ OPEN: "Kasus pemeriksaan dibuat", IN_PROGRESS: "Pemeriksaan kasus dimulai", PENDING_CLOSURE: "Penutupan kasus diajukan", CLOSED: "Kasus pemeriksaan ditutup" } as Record<string, string>)[event.to_state] ?? `Kasus: ${stateLabel(event.to_state)}`;
  return `${objectLabel(event.object_type)}: ${stateLabel(event.to_state)}`;
}
