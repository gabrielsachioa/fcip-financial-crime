import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  approveLabModel,
  monitorLabDataset,
  returnLabModel,
  setLabModelAlerts,
  submitLabModel,
  suspendLabModel,
} from "../api/lab";
import { errorMessage } from "../api/errors";
import { formatDateTime } from "../format";
import type { LabDataset, LabModelsResponse, LabModelVersion, LabMonitorResult } from "../types/lab";
import { Icon } from "./Icon";

const STATE_LABEL: Record<string, string> = {
  DRAFT: "Rancangan",
  PENDING_APPROVAL: "Menunggu persetujuan",
  ACTIVE: "Sedang dipakai",
  SUSPENDED: "Dihentikan sementara",
  RETIRED: "Sudah diganti",
  IN_SIMULATION: "Dalam simulasi",
};
const STATE_BADGE: Record<string, string> = {
  DRAFT: "badge-amber",
  PENDING_APPROVAL: "badge-blue",
  ACTIVE: "badge-green",
  SUSPENDED: "",
  RETIRED: "",
  IN_SIMULATION: "badge-blue",
};

function pct(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${(100 * value).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
    : "–";
}

function num(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("id-ID") : "–";
}

function score(value: number): string {
  const digits = value >= 0.01 && value <= 0.99 ? 4 : 6;
  return Number(value.toPrecision(digits)).toLocaleString("id-ID", { maximumSignificantDigits: digits });
}

function useModelsUpdate() {
  const queryClient = useQueryClient();
  return (data: LabModelsResponse) => {
    queryClient.setQueryData(["lab-models"], data);
    for (const key of ["models", "model-scores", "lab-run", "alerts", "audit"]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
}

// --- model alerts switch (CF-05) ---------------------------------------------------------------

function ModelAlertsBanner({ data, isMlro }: { data: LabModelsResponse; isMlro: boolean }) {
  const update = useModelsUpdate();
  const [reason, setReason] = useState("");
  const state = data.model_alerts;
  const toggle = useMutation({
    mutationFn: () => setLabModelAlerts(!state.active, reason),
    onSuccess: (result) => {
      update(result);
      setReason("");
    },
  });
  return (
    <div className={`lab-alerts-switch ${state.active ? "is-on" : ""}`}>
      <div>
        <p>
          <strong>Jadikan hasil model sebagai temuan untuk ditinjau</strong>{" "}
          <span className={`badge ${state.active ? "badge-green" : "badge-amber"}`}>
            {state.active ? "Dinyalakan" : "Dimatikan"}
          </span>
        </p>
        <p className="small">
          {state.active
            ? "Hasil dengan skor yang mencapai batas pada model aktif akan masuk ke antrean tinjauan. Aturan ini berlaku umum untuk penandaan dari model."
            : "Skor masih dapat dibaca sebagai informasi pendukung, tetapi tidak membuat temuan tersendiri di antrean tinjauan."}
        </p>
      </div>
      {isMlro && (
        <div className="lab-alerts-actions">
          <label htmlFor="model-alert-reason">Alasan perubahan <small>Minimal {data.min_reason_length} karakter agar keputusan dapat ditelusuri.</small></label>
          <input id="model-alert-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Jelaskan alasan perubahan aturan ini"
            aria-label="Alasan mengubah alert dari skor model"
          />
          <button
            type="button"
            className={state.active ? "button-secondary" : ""}
            onClick={() => toggle.mutate()}
            disabled={toggle.isPending || reason.trim().length < data.min_reason_length}
          >
            {toggle.isPending ? "Menyimpan perubahan..." : state.active ? "Matikan penandaan dari model" : "Nyalakan penandaan dari model"}
          </button>
          {toggle.error && <p className="error small" role="alert">{errorMessage(toggle.error)}</p>}
        </div>
      )}
    </div>
  );
}

// --- one model version ---------------------------------------------------------------------------

function VersionCard({
  version,
  role,
  minReason,
  modelAlertsActive,
  highlight,
}: {
  version: LabModelVersion;
  role: string | undefined;
  minReason: number;
  modelAlertsActive: boolean;
  highlight: boolean;
}) {
  const update = useModelsUpdate();
  const [text, setText] = useState("");
  const [alertsOn, setAlertsOn] = useState(true);
  const done = (result: LabModelsResponse) => {
    update(result);
    setText("");
  };
  const submit = useMutation({ mutationFn: () => submitLabModel(version.id, text), onSuccess: done });
  const approve = useMutation({
    // Only switch model alerts when the MLRO changes it here; otherwise leave it as it is.
    mutationFn: () => approveLabModel(version.id, text, alertsOn === modelAlertsActive ? null : alertsOn),
    onSuccess: done,
  });
  const giveBack = useMutation({ mutationFn: () => returnLabModel(version.id, text), onSuccess: done });
  const suspend = useMutation({ mutationFn: () => suspendLabModel(version.id, text), onSuccess: done });
  const busy = submit.isPending || approve.isPending || giveBack.isPending || suspend.isPending;
  const error = submit.error ?? approve.error ?? giveBack.error ?? suspend.error;
  const longEnough = text.trim().length >= minReason;
  const isAnalyst = role === "ROLE_ANALYST";
  const isMlro = role === "ROLE_MLRO";
  const canAct =
    (version.state === "DRAFT" && isAnalyst) ||
    (version.state === "PENDING_APPROVAL" && isMlro) ||
    (version.state === "ACTIVE" && isMlro);
  const waiting =
    version.state === "DRAFT"
      ? "Analis perlu mengajukan rancangan ini kepada penanggung jawab kepatuhan."
      : version.state === "PENDING_APPROVAL"
        ? "Menunggu penanggung jawab kepatuhan (MLRO) yang berbeda dari pengaju."
        : version.state === "ACTIVE"
          ? "Versi ini dipakai memeriksa unggahan baru yang sesuai. Status ini bukan jaminan ketepatan deteksi."
          : null;

  return (
    <article className={`lab-version ${highlight ? "is-current" : ""} state-${version.state.toLowerCase()}`}>
      <div className="lab-version-head">
        <div>
          <strong>{version.model_name}</strong>
          <span className="small muted">
            {" "}
            {version.dataset_name ?? "Contoh sumber belum tercatat"}
          </span>
        </div>
        <span className={`badge ${STATE_BADGE[version.state] ?? ""}`}>{STATE_LABEL[version.state] ?? version.state}</span>
      </div>
      <dl className="lab-version-facts">
        <div>
          <dt>Contoh yang dipelajari</dt>
          <dd>{version.dataset_name ?? "–"}</dd>
        </div>
        <div>
          <dt>Batas penandaan</dt>
          <dd className="mono">{score(version.threshold)}</dd>
        </div>
        <div>
          <dt>Pada data pembanding</dt>
          <dd>
            ketepatan {pct(version.validation.precision)} · cakupan {pct(version.validation.recall)}
          </dd>
        </div>
        <div>
          <dt>{version.evaluation_state === "REVEALED" ? "Uji akhir · pilihan terkunci" : "Hasil uji terdahulu · sudah terbuka"}</dt>
          <dd>
            ketepatan {pct(version.test.precision)} · cakupan {pct(version.test.recall)} ·{" "}
            {num(Math.round(version.test.flagged_per_10k ?? NaN))} ditandai / 10.000 transaksi
          </dd>
        </div>
        <div>
          <dt>Penanggung jawab</dt>
          <dd>
            dibuat {version.created_by_email ?? "–"}
            {version.submitted_by_email && <> · diajukan {version.submitted_by_email}</>}
            {version.approved_by_email && <> · disetujui {version.approved_by_email}</>}
          </dd>
        </div>
        {version.superseded_by_version && (
          <div>
            <dt>Diganti oleh</dt>
            <dd className="mono">{version.superseded_by_version}</dd>
          </div>
        )}
      </dl>
      {canAct ? (
        <div className="lab-version-action">
          <label htmlFor={`model-note-${version.id}`}>
            {version.state === "DRAFT" ? "Mengapa rancangan ini layak diajukan?" : version.state === "PENDING_APPROVAL" ? "Catatan hasil tinjauan" : "Mengapa pemeriksaan perlu dihentikan?"}
            <small>Minimal {minReason} karakter. Catatan ini disimpan dalam riwayat keputusan.</small>
          </label>
          <textarea
            id={`model-note-${version.id}`}
            rows={2}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              version.state === "DRAFT"
                ? "Jelaskan hasil pembanding, batasan, dan alasan pengajuan"
                : version.state === "PENDING_APPROVAL"
                  ? "Jelaskan dasar persetujuan atau hal yang harus diperbaiki"
                  : "Jelaskan alasan penghentian sementara"
            }
            aria-label="Catatan untuk tindakan ini"
            disabled={busy}
          />
          {version.state === "PENDING_APPROVAL" && (
            <label className="inline lab-alerts-check">
              <input type="checkbox" checked={alertsOn} onChange={(event) => setAlertsOn(event.target.checked)} />
              <span>Masukkan hasil yang mencapai batas skor ke antrean tinjauan, tanpa menunggu aturan pola lain.</span>
            </label>
          )}
          <div className="lab-version-buttons">
            {version.state === "DRAFT" && (
              <button type="button" onClick={() => submit.mutate()} disabled={busy || !longEnough}>
                <Icon name="arrow-right" size={15} />
                {submit.isPending ? "Mengajukan..." : "Ajukan untuk persetujuan"}
              </button>
            )}
            {version.state === "PENDING_APPROVAL" && (
              <>
                <button type="button" onClick={() => approve.mutate()} disabled={busy || !longEnough}>
                  <Icon name="check" size={15} />
                  {approve.isPending ? "Menyetujui..." : "Setujui & aktifkan"}
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => giveBack.mutate()}
                  disabled={busy || !longEnough}
                >
                  Kembalikan ke analis
                </button>
              </>
            )}
            {version.state === "ACTIVE" && (
              <button type="button" className="button-secondary" onClick={() => suspend.mutate()} disabled={busy || !longEnough}>
                Hentikan sementara
              </button>
            )}
          </div>
          {error && <p className="error small" role="alert">{errorMessage(error)}</p>}
        </div>
      ) : (
        waiting && <p className="small muted lab-version-waiting">{waiting}</p>
      )}
      {version.history.length > 0 && (
        <details className="lab-version-history">
          <summary>Riwayat ({version.history.length})</summary>
          <ol>
            {version.history.map((h, i) => (
              <li key={i}>
                <span className="small muted">{formatDateTime(h.at)}</span>{" "}
                <strong>
                  {h.from_state ? `${STATE_LABEL[h.from_state] ?? h.from_state} → ` : ""}
                  {STATE_LABEL[h.to_state] ?? h.to_state}
                </strong>{" "}
                <span className="small">
                  oleh {h.actor_email ?? "sistem"}
                  {h.actor_role ? ` (${h.actor_role.replace("ROLE_", "")})` : ""}
                </span>
                {h.reason && <div className="small muted">{h.reason}</div>}
              </li>
            ))}
          </ol>
        </details>
      )}
      <details className="lab-version-history">
        <summary>Identitas versi dan istilah pengujian</summary>
        <p className="small">Versi <span className="mono">{version.version}</span> · status teknis <span className="mono">{version.state}</span> · {version.training_kind === "supervised" ? "belajar dari label (supervised)" : "belajar tanpa label saat pelatihan (unsupervised)"}.</p>
        <p className="small">Ketepatan menunjukkan bagian hasil ditandai yang berlabel positif; cakupan menunjukkan bagian contoh positif yang ditemukan. Keduanya mengikuti jawaban acuan pada data simulasi, bukan kepastian fraud.</p>
      </details>
    </article>
  );
}

export function ModelApprovalPanel({
  data,
  role,
  datasetId,
}: {
  data: LabModelsResponse;
  role: string | undefined;
  datasetId: string | null;
}) {
  const ordered = [...data.items].sort((a, b) => {
    const rank = (v: LabModelVersion) => (v.state === "ACTIVE" ? 0 : v.state === "PENDING_APPROVAL" ? 1 : v.state === "DRAFT" ? 2 : 3);
    return rank(a) - rank(b) || b.created_at.localeCompare(a.created_at);
  });
  return (
    <section className="card lab-section" id="lab-step-6" aria-labelledby="lab-step-6-title">
      <div className="section-head">
        <div>
          <span className="section-kicker">LANGKAH 6</span>
          <h2 id="lab-step-6-title">Tinjau sebelum dipakai</h2>
          <p>
            Penanggung jawab kepatuhan (MLRO) yang berbeda dari pengaju meninjau rancangan. Persetujuan mengaktifkan versi ini dan mengganti model aktif sebelumnya.
          </p>
        </div>
        <span className="badge badge-blue">{data.items.length} versi tersimpan</span>
      </div>
      <ModelAlertsBanner data={data} isMlro={role === "ROLE_MLRO"} />
      {ordered.length === 0 ? (
        <p className="muted">Belum ada rancangan untuk ditinjau. Analis dapat menyimpan satu pilihan dari hasil pengujian di langkah 5.</p>
      ) : (
        <div className="lab-versions">
          {ordered.map((version) => (
            <VersionCard
              key={version.id}
              version={version}
              role={role}
              minReason={data.min_reason_length}
              modelAlertsActive={data.model_alerts.active}
              highlight={version.dataset_id === datasetId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// --- monitoring new data -------------------------------------------------------------------------

export function MonitorPanel({
  dataset,
  models,
  canMonitor,
  maxBytes,
  onResult,
}: {
  dataset: LabDataset;
  models: LabModelsResponse;
  canMonitor: boolean;
  maxBytes: number;
  onResult: (result: LabMonitorResult) => void;
}) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const monitor = useMutation({
    mutationFn: () => monitorLabDataset(dataset.id, file as File),
    onSuccess: (result) => {
      onResult(result);
      setFile(null);
      if (input.current) input.current.value = "";
      for (const key of ["alerts", "overview", "transactions", "batches", "quarantine", "model-scores", "model-counts", "audit"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
  const active = models.items.find((v) => v.state === "ACTIVE");
  const result = monitor.data;
  const mapped = dataset.status === "MAPPED";

  function choose(candidate: File | undefined) {
    setFileError("");
    monitor.reset();
    if (!candidate) return;
    if (!/\.(csv|parquet)$/i.test(candidate.name) || candidate.size > maxBytes) {
      setFileError(candidate.size > maxBytes ? "File melebihi batas upload." : "Pilih file .csv atau .parquet.");
      return;
    }
    setFile(candidate);
  }

  return (
    <section className="card lab-section" id="lab-step-7" aria-labelledby="lab-step-7-title">
      <div className="section-head">
        <div>
          <span className="section-kicker">LANGKAH 7</span>
          <h2 id="lab-step-7-title">Periksa transaksi baru</h2>
          <p>
            Unggah transaksi dengan susunan kolom yang sama seperti <strong>{dataset.name}</strong>. Sistem memeriksa datanya, lalu menjalankan aturan dan model yang tersedia.
          </p>
        </div>
        <span className="badge badge-blue">CSV / Parquet</span>
      </div>
      <ul className="lab-monitor-status">
        <li>
          <span>Model yang sedang dipakai</span>
          <strong className={active ? "" : "warn"}>
            {active ? `${active.model_name} · ${active.version}` : "Belum ada. Rancangan perlu disetujui di langkah 6."}
          </strong>
        </li>
        <li>
          <span>Penandaan dari skor model</span>
          <strong className={models.model_alerts.active ? "ok" : "warn"}>
            {models.model_alerts.active ? "Dinyalakan: dapat membuat temuan" : "Dimatikan: skor hanya informasi pendukung"}
          </strong>
        </li>
        <li>
          <span>Susunan kolom</span>
          <strong className={mapped ? "ok" : "warn"}>{mapped ? "Mengikuti contoh yang dipilih" : "Perlu dicocokkan lebih dulu"}</strong>
        </li>
      </ul>
      {canMonitor ? (
        <form
          className="lab-monitor-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (file && !monitor.isPending) monitor.mutate();
          }}
        >
          <label htmlFor="lab-monitor-file" className="file-select">
            <Icon name={file ? "file" : "upload"} size={16} /> {file ? file.name : "Pilih file transaksi baru"}
          </label>
          <input
            id="lab-monitor-file"
            ref={input}
            className="sr-only"
            type="file"
            accept=".csv,text/csv,.parquet"
            onChange={(event) => choose(event.target.files?.[0])}
          />
          <button type="submit" disabled={!file || monitor.isPending || !mapped}>
            <Icon name="activity" size={16} />
            {monitor.isPending ? "Memeriksa transaksi..." : "Unggah & periksa transaksi"}
          </button>
          {fileError && <p className="error small" role="alert">{fileError}</p>}
          {monitor.error && <p className="error small" role="alert">{errorMessage(monitor.error)}</p>}
          {monitor.isPending && (
            <div className="processing-state" role="status">
              <span className="spinner" />
              Memeriksa kelengkapan data, menyimpan unggahan, lalu mencari pola. Tunggu sampai ringkasan hasil tersedia.
            </div>
          )}
        </form>
      ) : (
        <p className="muted">Petugas data mengunggah transaksi baru. Akun Anda dapat membaca hasil sesuai kewenangan yang tersedia.</p>
      )}
      {result && (
        <div className="lab-monitor-result" role="status">
          <div className="lab-tiles">
            <div className="lab-tile">
              <span>Baris diterima</span>
              <strong>{num(result.accepted)}</strong>
              <small>
                dari {num(result.total_rows)} · nomor unggahan {result.batch_ref}
              </small>
            </div>
            <div className="lab-tile">
              <span>Perlu perbaikan data</span>
              <strong>{num(result.quarantined)}</strong>
              <small>alasan pemisahan tersedia di halaman Beranda</small>
            </div>
            <div className="lab-tile">
              <span>Temuan dari model</span>
              <strong>{num(result.model_alerts_created)}</strong>
              <small>
                {result.models.map((m) => `${num(m.units_flagged)} ${m.unit === "AML" ? "rangkuman mingguan" : "transaksi"} mencapai batas`).join(" · ") || "tidak ada model aktif"}
              </small>
            </div>
            <div className="lab-tile">
              <span>Temuan dari aturan pola</span>
              <strong>{num(result.rule_alerts_created)}</strong>
              <small>berdasarkan aturan pola yang sedang aktif</small>
            </div>
          </div>
          <p className="small muted">
            {num(result.account_proxies_created)} rekening baru dicatat memakai pengganti identitas anonim ·
            selesai dalam {result.seconds.toLocaleString("id-ID")} detik.
          </p>
          <p className="notice lab-note">Beberapa transaksi dapat digabung menjadi satu temuan. Hasil ditandai perlu ditinjau manusia; hasil yang tidak ditandai belum tentu bebas masalah.</p>
          {result.mapping_report.notes.map((note) => (
            <p key={note} className="notice lab-note">{note}</p>
          ))}
          <Link to="/alerts" className="btn-link">
            Lihat temuan yang perlu ditinjau <Icon name="arrow-right" size={14} />
          </Link>
          <p className="signal-notice small">{result.signal_notice}</p>
        </div>
      )}
    </section>
  );
}
