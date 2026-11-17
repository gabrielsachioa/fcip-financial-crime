import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  fetchBatches,
  fetchOverview,
  fetchQuarantine,
  fetchTransactions,
  runDetection,
  uploadTransactions,
} from "../api/data";
import { errorMessage } from "../api/errors";
import { fetchModels, fetchScores } from "../api/ml";
import { Icon, type IconName } from "../components/Icon";
import { SignalNotice } from "../components/Notices";
import { useAuth } from "../context/AuthContext";
import {
  formatAmount,
  formatDateTime,
  formatObservedDateTime,
} from "../format";
import type { Direction } from "../types";
import "../operations.css";

const PAGE_SIZE = 25;
// Matches the existing ingestion API cap; does not change its validation.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const number = (value: number) => value.toLocaleString("id-ID");

export function OverviewPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<Direction | "">("");
  const [offset, setOffset] = useState(0);
  const [workspaceView, setWorkspaceView] = useState<"transactions" | "uploads" | "quality">("transactions");
  // Empty metadata retains the existing API defaults (FR-101).
  const [sourceSystem, setSourceSystem] = useState("");
  const [businessDate, setBusinessDate] = useState("");
  const [expectedRecords, setExpectedRecords] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const overview = useQuery({ queryKey: ["overview"], queryFn: fetchOverview });
  const transactions = useQuery({
    queryKey: ["transactions", search, direction, offset],
    queryFn: () =>
      fetchTransactions({
        search: search || undefined,
        direction: direction || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    placeholderData: (previous) => previous,
  });
  const quarantine = useQuery({
    queryKey: ["quarantine"],
    queryFn: () => fetchQuarantine(25),
  });
  const batches = useQuery({
    queryKey: ["batches"],
    queryFn: () => fetchBatches(10),
  });
  const models = useQuery({ queryKey: ["models"], queryFn: fetchModels });
  const behavioral =
    models.data?.some((model) => model.score_kind === "anomaly_score") ?? false;
  const hasActiveModel =
    models.data?.some((model) => model.state === "ACTIVE") ?? false;
  // Separate units and real server totals; never add AML weeks to Fraud transactions.
  const aml = useQuery({
    queryKey: ["model-counts", "AML"],
    queryFn: () => fetchScores({ unit: "AML", limit: 1, offset: 0 }),
  });
  const fraud = useQuery({
    queryKey: ["model-counts", "FRAUD"],
    queryFn: () => fetchScores({ unit: "FRAUD", limit: 1, offset: 0 }),
  });

  function refreshData() {
    for (const key of [
      "overview",
      "transactions",
      "quarantine",
      "batches",
      "models",
      "model-counts",
      "model-scores",
      "alerts",
      "audit",
    ]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  }
  const upload = useMutation({
    mutationFn: (file: File) =>
      uploadTransactions(file, {
        source_system: sourceSystem,
        business_date: businessDate,
        expected_records: expectedRecords,
      }),
    onSuccess: () => {
      refreshData();
      setSelectedFile(null);
      if (fileInput.current) fileInput.current.value = "";
    },
  });
  const detect = useMutation({
    mutationFn: runDetection,
    onSuccess: refreshData,
  });
  const busy = upload.isPending || detect.isPending;
  const canUpload = user?.role === "ROLE_DATA_OPS";
  const canDetect = canUpload || user?.role === "ROLE_ANALYST";
  const total = transactions.data?.total ?? 0;
  const data = overview.data;
  const qualityTotal = data ? data.transactions + data.quarantined : 0;
  const shownOffset = transactions.data?.offset ?? offset;
  const shownFrom = total === 0 ? 0 : shownOffset + 1;
  const shownTo = Math.min(shownOffset + PAGE_SIZE, total);

  function chooseFile(file: File | undefined) {
    if (busy) return;
    setFileError("");
    upload.reset();
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (
      !/\.(csv|parquet)$/i.test(file.name) ||
      file.size > MAX_UPLOAD_BYTES
    ) {
      setSelectedFile(null);
      setFileError(
        file.size > MAX_UPLOAD_BYTES
          ? "Ukuran file melebihi 50 MiB. Bagi data menjadi beberapa file yang lebih kecil."
          : "Pilih file transaksi berformat .csv atau .parquet.",
      );
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setSelectedFile(file);
  }

  function openWorkspace(view: typeof workspaceView) {
    setWorkspaceView(view);
    requestAnimationFrame(() => {
      const workspace = document.getElementById("workspace-data");
      workspace?.scrollIntoView({ behavior: "auto", block: "start" });
      workspace?.focus({ preventScroll: true });
    });
  }

  const newRuleFindings = detect.data?.rules.reduce((sum, rule) => sum + rule.alerts_created, 0) ?? 0;

  return (
    <div className="operations-page">
      <div className="page-header">
        <div>
          <span className="ops-eyebrow">Ruang kerja transaksi</span>
          <h1>Beranda</h1>
          <p>Lihat data yang masuk, jalankan pemeriksaan, lalu tinjau temuan yang membutuhkan perhatian.</p>
        </div>
        <button type="button" className="button-secondary refresh-button" onClick={refreshData} disabled={overview.isFetching}>
          <Icon name="history" size={16} /> {overview.isFetching ? "Memperbarui…" : "Perbarui data"}
        </button>
      </div>

      <section className="ops-welcome" aria-labelledby="welcome-heading">
        <div className="ops-welcome-copy">
          <span className="ops-eyebrow">Mulai dari sini</span>
          <h2 id="welcome-heading">Temukan hal yang perlu diperiksa, pahami alasannya.</h2>
          <p>FCIP membantu mengenali aktivitas yang tidak biasa. Temuan adalah petunjuk untuk ditinjau manusia; transaksi yang ditandai belum tentu bermasalah.</p>
          <Link to="/alerts" className="button ops-welcome-action">Tinjau temuan <Icon name="arrow-right" size={17} /></Link>
          <Link className="ops-guide-link" to="/guide">Baru pertama kali? Buka panduan penggunaan</Link>
        </div>
        <div className="ops-welcome-summary">
          <span className="ops-welcome-symbol"><Icon name="eye" size={26} /></span>
          <span>Temuan menunggu ditinjau</span>
          <strong>{data ? number(data.alerts_open) : "—"}</strong>
          <p>Satu temuan dapat berisi beberapa transaksi yang saling terkait.</p>
        </div>
      </section>

      {overview.error && <p className="error" role="alert">Ringkasan belum dapat ditampilkan. Coba perbarui data. {errorMessage(overview.error)}</p>}

      <section className="ops-summary-grid" aria-label="Ringkasan data saat ini">
        <Summary label="Transaksi tersimpan" value={data?.transactions} icon="wallet" text="Lolos pemeriksaan format data; belum berarti dinyatakan normal." />
        <Summary label="Pemeriksaan lanjutan" value={data?.alerts_escalated} icon="search" text="Temuan yang sudah diteruskan untuk diperiksa lebih lanjut." to="/alerts?status=ESCALATED" />
        <Summary label="Kasus pemeriksaan" value={data?.cases} icon="file" text="Wadah untuk mengumpulkan temuan dan bukti terkait." />
        <Summary label="Baris perlu diperbaiki" value={data?.quarantined} icon="alert" text="Belum dapat dipakai karena ada masalah pada isi atau format data." onClick={() => openWorkspace("quality")} />
      </section>

      <section className="ops-journey" aria-label="Tiga langkah penggunaan">
        <article>
          <span className="ops-step-number">1</span>
          <div><h3>Tambahkan transaksi</h3><p>Masukkan file transaksi. Sistem memeriksa kelengkapan dan formatnya terlebih dahulu.</p>
            {canUpload ? <button type="button" className="ops-text-button" onClick={() => openWorkspace("uploads")}>Pilih file transaksi <Icon name="arrow-right" size={14} /></button> : <span className="muted small">Dilakukan oleh pengelola data.</span>}
          </div>
        </article>
        <article>
          <span className="ops-step-number">2</span>
          <div><h3>Periksa aktivitas</h3><p>Jalankan aturan pemeriksaan dan model yang sudah diaktifkan untuk mencari hal yang perlu ditinjau.</p>
            {canDetect ? <button type="button" className="ops-text-button" onClick={() => openWorkspace("uploads")}>Buka pemeriksaan <Icon name="arrow-right" size={14} /></button> : <span className="muted small">Dilakukan oleh pengelola data atau analis.</span>}
          </div>
        </article>
        <article>
          <span className="ops-step-number">3</span>
          <div><h3>Pahami setiap temuan</h3><p>Baca alasan penandaan dan transaksi terkait sebelum menentukan tindak lanjutnya.</p>
            <Link to="/alerts">Buka daftar temuan <Icon name="arrow-right" size={14} /></Link>
          </div>
        </article>
      </section>

      <section className="ops-workspace" id="workspace-data" aria-labelledby="workspace-heading" tabIndex={-1}>
        <div className="ops-workspace-header">
          <div><h2 id="workspace-heading">Data & pemeriksaan</h2><p className="muted">Pilih pekerjaan yang ingin dilakukan.</p></div>
          <div className="ops-view-switch" role="group" aria-label="Pilih tampilan data">
            <button type="button" aria-pressed={workspaceView === "transactions"} onClick={() => setWorkspaceView("transactions")}>Daftar transaksi</button>
            <button type="button" aria-pressed={workspaceView === "uploads"} onClick={() => setWorkspaceView("uploads")}>{canUpload ? "Tambah & periksa data" : "Pemeriksaan data"}</button>
            <button type="button" aria-pressed={workspaceView === "quality"} onClick={() => setWorkspaceView("quality")}>Data perlu diperbaiki</button>
          </div>
        </div>

        <div hidden={workspaceView !== "transactions"}>
          <section className="card" aria-busy={transactions.isFetching}>
            <div className="section-head"><div><h3>Transaksi yang sudah tersimpan</h3><p>{transactions.data ? `${number(total)} transaksi dalam hasil ini.` : "Memuat daftar transaksi…"} Daftar ini memuat data, bukan keputusan apakah transaksi normal atau mencurigakan.</p></div></div>
            <form className="ops-search-row" onSubmit={(event) => event.preventDefault()} role="search" aria-label="Cari transaksi tersimpan">
              <label>Cari transaksi<input type="search" placeholder="Nomor transaksi, rekening, atau nasabah" aria-label="Cari transaksi" maxLength={100} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label>
              <label>Arah dana<select aria-label="Filter arah transaksi" value={direction} onChange={(event) => { setDirection(event.target.value as Direction | ""); setOffset(0); }}><option value="">Semua arah</option><option value="CREDIT">Masuk ke rekening</option><option value="DEBIT">Keluar dari rekening</option></select></label>
            </form>
            {(transactions.isLoading || transactions.isFetching) && <p className="loading-text" role="status">{transactions.isLoading ? "Memuat transaksi…" : "Memperbarui daftar transaksi…"}</p>}
            {transactions.error && <p className="error" role="alert">Daftar belum dapat dimuat. {errorMessage(transactions.error)}</p>}
            {transactions.data?.items.length === 0 && <Empty icon="wallet" title={search || direction ? "Belum ada transaksi yang sesuai" : "Belum ada transaksi tersimpan"} text={search || direction ? "Coba nomor transaksi lain atau pilih semua arah dana." : canUpload ? "Mulai dari Tambah & periksa data untuk memasukkan file transaksi pertama." : "Transaksi akan muncul setelah pengelola data menambahkan file."} />}
            {!!transactions.data?.items.length && <>
              <div className="table-scroll" tabIndex={0} role="region" aria-label="Daftar transaksi tersimpan">
                <table className="table ops-transactions-table"><thead><tr><th>Transaksi</th><th>Pemilik rekening</th><th className="num">Nominal</th><th>Arah dana</th><th>Rincian</th></tr></thead>
                  <tbody>{transactions.data.items.map((row) => <tr key={row.id}>
                    <td><strong className="mono">{row.transaction_ref}</strong><div className="muted">{formatObservedDateTime(row.transaction_date, row.timestamp_precision ?? "day", row.source_timezone_known ?? false)}</div></td>
                    <td><strong>{row.customer_name}</strong><div className="muted mono">{row.account_number}</div><div className="muted small">Referensi nasabah: {row.customer_ref}</div></td>
                    <td className="num"><strong>{formatAmount(row.amount, row.currency)}</strong></td>
                    <td><span className={`badge ${row.direction === "CREDIT" ? "badge-green" : "badge-blue"}`}>{row.direction === "CREDIT" ? "Masuk" : "Keluar"}</span></td>
                    <td><details className="ops-inline-details"><summary>Lihat rincian</summary><dl className="ops-detail-list"><dt>Kanal pembayaran</dt><dd>{channelLabel(row.channel)}</dd><dt>Pihak lawan transaksi</dt><dd>{row.counterparty_ref ?? "Tidak dicantumkan dalam data"}</dd><dt>Kode arah dari sumber</dt><dd className="mono">{row.direction}</dd></dl></details></td>
                  </tr>)}</tbody>
                </table>
              </div>
              <div className="pager"><span className="muted">Menampilkan {number(shownFrom)}–{number(shownTo)} dari {number(total)} transaksi</span><div className="inline-controls"><button className="button-secondary" type="button" disabled={offset === 0 || transactions.isFetching} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}><Icon name="arrow-left" size={15} /> Sebelumnya</button><button className="button-secondary" type="button" disabled={offset + PAGE_SIZE >= total || transactions.isFetching} onClick={() => setOffset(offset + PAGE_SIZE)}>Berikutnya <Icon name="arrow-right" size={15} /></button></div></div>
            </>}
          </section>
        </div>

        <div hidden={workspaceView !== "uploads"}>
          <div className="ops-tools-grid">
            {canUpload ? <section className="card ops-upload-card" id="upload-data">
              <div className="section-head"><div><span className="ops-eyebrow">Langkah 1</span><h3>Tambahkan file transaksi</h3><p>Gunakan data sintetis. Baris yang belum memenuhi format akan dipisahkan untuk diperbaiki.</p></div></div>
              <form onSubmit={(event) => { event.preventDefault(); if (selectedFile && !busy) upload.mutate(selectedFile); }}>
                <div className={`upload-drop ${dragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]); }}>
                  <span className="ops-upload-symbol"><Icon name={selectedFile ? "file" : "upload"} size={26} /></span>
                  <div><strong>{selectedFile ? selectedFile.name : "Tarik file transaksi ke sini"}</strong><p>{selectedFile ? `${(selectedFile.size / (1024 * 1024)).toLocaleString("id-ID", { maximumFractionDigits: 2 })} MiB · siap ditambahkan` : "CSV atau Parquet · maksimal 50 MiB (sekitar 52 MB)"}</p><label htmlFor="csv-file" className="file-select">{selectedFile ? "Pilih file lain" : "Pilih file dari perangkat"}</label><input id="csv-file" ref={fileInput} className="sr-only" type="file" accept=".csv,text/csv,.parquet" aria-label="Pilih file transaksi (CSV atau Parquet)" disabled={busy} onChange={(event) => chooseFile(event.target.files?.[0])} /></div>
                </div>
                <p className="ops-file-help">CSV dan Parquet adalah format file tabel. Untuk CSV, gunakan pengodean teks UTF-8 agar huruf terbaca dengan benar.</p>
                <details className="upload-options ops-disclosure"><summary>Keterangan unggahan tambahan <span>opsional</span></summary><p className="muted small">Biarkan kosong jika tidak diperlukan. Sistem memakai pengaturan bawaan yang sudah tersedia.</p><div className="batch-fields">
                  <label>Asal data<input aria-label="Asal data" value={sourceSystem} onChange={(event) => setSourceSystem(event.target.value)} placeholder="Contoh: unggahan manual" disabled={busy} /><small>Nama sistem atau sumber file ini.</small></label>
                  <label>Tanggal data<input aria-label="Tanggal data" type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} disabled={busy} /><small>Tanggal acuan data untuk unggahan ini, bukan waktu file ditambahkan.</small></label>
                  <label>Jumlah baris yang diharapkan<input aria-label="Jumlah baris yang diharapkan" type="number" min={0} step={1} value={expectedRecords} onChange={(event) => setExpectedRecords(event.target.value)} placeholder="Opsional" disabled={busy} /><small>Untuk mencocokkan jumlah isi file dengan hasil pembacaan.</small></label>
                </div></details>
                <div className="upload-footer"><p>Jika data terbagi dalam beberapa file, tambahkan semuanya sebelum memeriksa aktivitas.</p><button type="submit" disabled={busy || !selectedFile}><Icon name="upload" size={16} />{upload.isPending ? "Menambahkan…" : "Tambahkan file"}</button></div>
                {fileError && <p className="error upload-feedback" role="alert">{fileError}</p>}
                {upload.error && <p className="error upload-feedback" role="alert">File belum berhasil ditambahkan. {errorMessage(upload.error)}</p>}
                {upload.isPending && <div className="processing-state" role="status"><span className="spinner" />File sedang dibaca dan diperiksa. Tunggu hasilnya sebelum melanjutkan.</div>}
                {upload.data && <div className="ops-result" role="status"><span className="badge badge-blue">{batchLabel(upload.data.batch_status)}</span><h4>Hasil pembacaan file</h4><p>{upload.data.file_name}</p><div className="upload-result-counts"><span><strong>{number(upload.data.total_rows)}</strong>baris dibaca</span><span className="ok"><strong>{number(upload.data.accepted)}</strong>tersimpan</span><span className="warn"><strong>{number(upload.data.quarantined)}</strong>perlu diperbaiki</span></div><p>Baris yang tersimpan dapat diperiksa pada langkah berikutnya. Periksa juga baris yang dipisahkan, bila ada.</p><button type="button" className="ops-text-button" onClick={() => openWorkspace("quality")}>Lihat data yang perlu diperbaiki <Icon name="arrow-right" size={14} /></button><details className="ops-inline-details"><summary>Nomor unggahan</summary><span className="mono">{upload.data.batch_ref ?? "Belum tersedia"}</span></details></div>}
              </form>
            </section> : <section className="card"><span className="ops-eyebrow">Data transaksi</span><h3>Penambahan data dilakukan oleh pengelola</h3><p>Peranmu dapat melihat hasil unggahan. Hubungi pengelola data bila ada transaksi yang perlu ditambahkan atau diperbaiki.</p><Quality accepted={data?.transactions} quarantined={data?.quarantined} /></section>}

            <section className="card ops-check-card" id="check-transactions">
              <div className="section-head"><div><span className="ops-eyebrow">Langkah 2</span><h3>Periksa aktivitas transaksi</h3><p>Sistem mencari pola yang perlu ditinjau. Pemeriksaan ini tidak memblokir atau mengubah transaksi.</p></div></div>
              <div className="ops-check-explainer"><Icon name="scan" size={24} /><div><strong>Apa yang akan diperiksa?</strong><p>Aturan mencari pola tertentu pada riwayat. Model yang sudah diaktifkan juga memberi skor untuk membantu memilih aktivitas yang perlu diperhatikan.</p></div></div>
              {canDetect ? <button type="button" className="ops-check-button" onClick={() => detect.mutate()} disabled={busy || !data?.transactions}><Icon name="scan" size={17} />{detect.isPending ? "Sedang memeriksa…" : "Mulai pemeriksaan"}</button> : <p className="ops-note">Pemeriksaan dijalankan oleh pengelola data atau analis.</p>}
              {!data?.transactions && <p className="muted small">Tambahkan transaksi yang lolos pemeriksaan format terlebih dahulu.</p>}
              {models.isSuccess && !hasActiveModel && <p className="ops-note" role="status">Belum ada model yang diaktifkan. Pemeriksaan tetap dapat memakai aturan yang tersedia.</p>}
              {models.error && <p className="error" role="alert">Status model belum dapat dimuat. {errorMessage(models.error)}</p>}
              {detect.isPending && <div className="processing-state" role="status"><span className="spinner" />Riwayat transaksi sedang diperiksa. Proses dapat memerlukan beberapa menit.</div>}
              {detect.error && <p className="error upload-feedback" role="alert">Pemeriksaan belum berhasil. {errorMessage(detect.error)}</p>}
              {detect.data && <div className="ops-result" role="status"><span className="badge badge-green">Pemeriksaan selesai</span><h4>{number(newRuleFindings + detect.data.ml.alerts_created)} temuan baru dibuat</h4><p>Temuan dibuat dari aturan dan, jika tersedia, model yang diaktifkan. Jumlah temuan berbeda dari jumlah transaksi karena beberapa transaksi dapat dikelompokkan.</p><Link className="button" to="/alerts">Tinjau hasil pemeriksaan <Icon name="arrow-right" size={16} /></Link><details className="ops-disclosure"><summary>Rincian hasil pemeriksaan</summary>{detect.data.rules.map((rule) => <p className="small" key={rule.detection_run_id}>Aturan {rule.pattern_code}: {number(rule.alerts_created)} temuan baru; {number(rule.alerts_already_existing)} sudah tercatat.</p>)}{detect.data.ml.models.map((model) => <p key={model.model_version} className="small">Model {model.model_version}: {number(model.units_scored)} {model.unit === "AML" ? "unit mingguan" : "transaksi"} dinilai; {number(model.units_flagged)} mencapai batas penandaan.{!!model.observations_skipped_currency && <> {number(model.observations_skipped_currency)} transaksi tidak dinilai karena mata uang berbeda.</>}</p>)}<p className="small">{detect.data.ml.ml_rule_versions_evaluated.length ? `${number(detect.data.ml.alerts_created)} temuan baru dari skor model.` : "Aturan pembuat temuan dari model belum dievaluasi; skor model tidak membuat temuan baru pada proses ini."}</p></details></div>}
              <details className="ops-disclosure ops-model-settings"><summary>Model & rincian teknis pemeriksaan</summary><p className="muted small">Model adalah metode otomatis yang mempelajari pola data. Status aktif hanya berarti boleh dipakai, bukan jaminan ketepatan hasil.</p>
                {models.isLoading && <p role="status">Memuat pengaturan…</p>}{models.data?.length === 0 && <p className="muted">Belum ada model terdaftar.</p>}
                {models.data?.map((model) => <div className="model-health" key={model.id}><div className="model-health-head"><strong>{model.unit === "AML" ? "Pemeriksaan aktivitas mingguan (AML)" : "Pemeriksaan per transaksi"}</strong><span className={`badge ${model.state === "ACTIVE" ? "badge-green" : "badge-amber"}`}>{modelStateLabel(model.state)}</span></div><p className="mono">{model.version}</p><p>Batas penandaan: {model.threshold.toLocaleString("id-ID", { maximumFractionDigits: 6 })}. Batas ini adalah nilai skor pemicu, bukan persentase kemungkinan kejahatan.</p><p>Unit yang dinilai: {model.unit === "AML" ? model.score_kind === "anomaly_score" ? "satu identitas rekening dalam data per minggu kalender sumber" : "satu nasabah per minggu kalender" : "satu transaksi"}.</p>{model.score_kind === "anomaly_score" && <p>Mencari ketidakwajaran tanpa label acuan (unsupervised). Mata uang: {model.currency ?? "belum diketahui"}; tanpa konversi kurs.</p>}</div>)}
                {(aml.error || fraud.error) && <p className="error" role="alert">Jumlah hasil otomatis belum tersedia. {errorMessage(aml.error ?? fraud.error)}</p>}
                <div className="ops-model-counts"><Link to="/model-flags?unit=FRAUD"><strong>{fraud.data ? number(fraud.data.total) : "—"}</strong> transaksi tersimpan di atas batas model</Link><Link to="/model-flags?unit=AML"><strong>{aml.data ? number(aml.data.total) : "—"}</strong> {behavioral ? "unit rekening-minggu" : "unit nasabah-minggu"} tersimpan di atas batas model</Link></div>
                <p className="muted small">Jumlah kedua jenis unit tidak dijumlahkan. AML berarti pemeriksaan pola yang dapat mendukung peninjauan pencucian uang, bukan konfirmasi pencucian uang.</p>
                {behavioral && <p className="muted small">Identitas pemilik rekening tidak disimpulkan dari data transaksi. Aturan P02 khusus IDR; model mata uang lain tidak mengubah batas aturan tersebut.</p>}
                <Link to="/model-flags">Lihat hasil otomatis <Icon name="arrow-right" size={14} /></Link>
              </details>
            </section>
          </div>

          <section className="card ops-batches" id="ingestion-batches"><div className="section-head"><div><h3>Riwayat unggahan</h3><p>Satu unggahan disebut batch: satu file yang dibaca dan dicatat bersama hasilnya. Selesai diproses dapat tetap memiliki baris yang perlu diperbaiki.</p></div><span className="badge badge-neutral">{batches.data ? number(batches.data.total) : "—"} unggahan</span></div>
            {batches.isLoading && <p className="loading-text" role="status">Memuat riwayat unggahan…</p>}{batches.error && <p className="error" role="alert">{errorMessage(batches.error)}</p>}
            {batches.data?.items.length === 0 && <Empty icon="file" title="Belum ada unggahan" text="Setelah file ditambahkan, hasil pembacaan dan jejak aktivitasnya muncul di sini." />}
            {!!batches.data?.items.length && <div className="table-scroll" tabIndex={0} role="region" aria-label="Riwayat unggahan"><table className="table"><thead><tr><th>File & waktu unggahan</th><th>Hasil pembacaan</th><th>Status pemrosesan</th><th>Rincian</th></tr></thead><tbody>{batches.data.items.map((batch) => <tr key={batch.id}><td><strong>{batch.file_name}</strong><div className="muted">{formatDateTime(batch.created_at)}</div></td><td><strong>{number(batch.accepted_rows)} tersimpan</strong><div className="muted">{number(batch.quarantined_rows)} perlu diperbaiki · {number(batch.total_rows)} dibaca</div></td><td><span className={`badge ${batch.status === "COMPLETED" ? "badge-green" : "badge-amber"}`}>{batchLabel(batch.status)}</span></td><td><details className="ops-inline-details"><summary>Asal & jejak unggahan</summary><dl className="ops-detail-list"><dt>Nomor unggahan</dt><dd className="mono">{batch.batch_ref}</dd><dt>Asal data</dt><dd>{batch.source_system}</dd><dt>Tanggal bisnis</dt><dd>{batch.business_date}</dd><dt>Ditambahkan oleh</dt><dd>{batch.registered_by_email ?? "Tidak tercatat"}</dd><dt>Sidik berkas SHA-256</dt><dd className="mono">{batch.file_checksum}</dd></dl><p className="muted small">Sidik berkas membantu memeriksa bahwa file yang dirujuk tetap sama.</p><Link to={`/audit?correlation_id=${batch.correlation_id}`}>Lihat rangkaian aktivitas <Icon name="arrow-right" size={14} /></Link></details></td></tr>)}</tbody></table></div>}
          </section>
        </div>

        <div hidden={workspaceView !== "quality"}>
          <section className="card"><div className="section-head"><div><h3>Data yang perlu diperbaiki</h3><p>Baris ini dipisahkan karena belum dapat dipakai, bukan karena telah dinyatakan fraud. Proses pemisahan ini disebut quarantine.</p></div><span className="badge badge-amber">{quarantine.data ? number(quarantine.data.total) : "—"} baris</span></div>
            <Quality accepted={data?.transactions} quarantined={data?.quarantined} />
            {quarantine.isLoading && <p className="loading-text" role="status">Memuat baris yang perlu diperbaiki…</p>}{quarantine.error && <p className="error" role="alert">{errorMessage(quarantine.error)}</p>}
            {quarantine.data?.items.length === 0 && <Empty icon="check" title={qualityTotal ? "Tidak ada baris yang dipisahkan" : "Belum ada hasil pemeriksaan data"} text={qualityTotal ? "Semua baris yang dibaca lolos pemeriksaan format. Ini belum menyatakan seluruh transaksi normal." : "Hasilnya akan muncul setelah file transaksi pertama ditambahkan."} />}
            {!!quarantine.data?.items.length && <><p className="ops-note">Periksa file sumber berdasarkan nomor baris dan alasannya. Hubungi pengelola data untuk menyiapkan perbaikannya; halaman ini tidak mengubah isi file.</p><p className="muted small">Menampilkan {number(quarantine.data.items.length)} dari {number(quarantine.data.total)} baris.</p><div className="ops-quality-list">{quarantine.data.items.map((item) => <article key={item.id}><span className="ops-quality-symbol"><Icon name="alert" size={19} /></span><div><h4>Baris {item.row_number} perlu diperiksa</h4><p>{validationLabel(item.error_reason)}</p><span className="muted small">File: {item.source_file_name}</span><details className="ops-inline-details"><summary>Lihat pesan validasi asli</summary><p className="mono small">{item.error_reason}</p></details></div></article>)}</div></>}
          </section>
        </div>
      </section>

      <SignalNotice text={aml.data?.signal_notice ?? fraud.data?.signal_notice} />
      <div className="ops-data-footnote"><Icon name="info" size={17} /><span>{data ? `${number(data.accounts)} rekening dan ${number(data.customers)} ${behavioral ? "identitas dalam data sumber" : "nasabah"} tercatat.` : "Ringkasan sumber data belum tersedia."}{data?.latest_transaction_date && <> Transaksi terbaru: {formatObservedDateTime(data.latest_transaction_date, data.latest_transaction_timestamp_precision ?? "day", data.latest_transaction_source_timezone_known ?? false)}.</>}</span></div>
    </div>
  );
}

function Summary({ label, value, icon, text, to, onClick }: { label: string; value?: number; icon: IconName; text: string; to?: string; onClick?: () => void }) {
  const content = <><div className="ops-summary-label"><Icon name={icon} size={19} /><span>{label}</span></div><strong className="ops-summary-value">{value === undefined ? "—" : number(value)}</strong><p>{text}</p></>;
  return to ? <Link className="ops-summary-card" to={to}>{content}</Link> : onClick ? <button type="button" className="ops-summary-card" onClick={onClick}>{content}</button> : <div className="ops-summary-card">{content}</div>;
}

function Empty({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return <div className="empty-state"><Icon name={icon} size={28} /><h3>{title}</h3><p>{text}</p></div>;
}

function Quality({ accepted, quarantined }: { accepted?: number; quarantined?: number }) {
  const total = (accepted ?? 0) + (quarantined ?? 0);
  return <div className="ops-quality-summary" aria-label="Hasil pemeriksaan format keseluruhan"><div className="quality-track" aria-hidden="true"><span className="quality-accepted" style={{ width: `${total ? ((accepted ?? 0) * 100) / total : 0}%` }} /><span className="quality-rejected" style={{ width: `${total ? ((quarantined ?? 0) * 100) / total : 0}%` }} /></div><div className="quality-legend"><span>{accepted === undefined ? "—" : number(accepted)} baris tersimpan</span><span>{quarantined === undefined ? "—" : number(quarantined)} perlu diperbaiki</span></div></div>;
}

function batchLabel(state: string | null) { return ({ REGISTERED: "Terdaftar", COMPLETED: "Selesai diproses", NEEDS_REVIEW: "Hasil perlu diperiksa", FAILED: "Gagal diproses" } as Record<string, string>)[state ?? ""] ?? state ?? "Status belum tersedia"; }
function modelStateLabel(state: string) { return ({ ACTIVE: "Diaktifkan", DRAFT: "Draf", PENDING_APPROVAL: "Menunggu persetujuan", IN_SIMULATION: "Sedang diuji", SUSPENDED: "Dihentikan sementara", RETIRED: "Tidak digunakan lagi" } as Record<string, string>)[state] ?? state; }
function channelLabel(channel: string) { return ({ MOBILE: "Aplikasi seluler", MOBILE_APP: "Aplikasi seluler", BANK_TRANSFER: "Transfer bank", WEB: "Situs web", AGENT: "Agen", ATM: "ATM", UNKNOWN: "Tidak dicantumkan" } as Record<string, string>)[channel] ?? channel; }
function validationLabel(reason: string) {
  const messages: string[] = [];
  if (/duplicate|already exists/i.test(reason)) messages.push("Nomor transaksi sudah tercatat atau berulang dalam file.");
  if (/transaction_date.*invalid|invalid.*date/i.test(reason)) messages.push("Tanggal transaksi belum dapat dibaca sesuai format yang diharapkan.");
  if (/amount.*(positive|greater|invalid)|invalid.*amount/i.test(reason)) messages.push("Periksa penulisan nominal dan pastikan nilainya memenuhi format yang diminta.");
  if (/account.*(unknown|not found|does not exist)/i.test(reason)) messages.push("Rekening transaksi belum dikenali dalam data referensi.");
  return messages.length ? messages.join(" ") : "Ada isi data yang belum memenuhi pemeriksaan. Buka pesan validasi asli untuk melihat bagian yang perlu diperiksa.";
}
