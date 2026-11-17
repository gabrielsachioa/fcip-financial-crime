import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  fetchLabDataset,
  fetchLabDatasets,
  fetchLabModels,
  fetchLabOptions,
  fetchLabRun,
  saveLabMapping,
  saveLabModel,
  trainLabModels,
  uploadLabDataset,
} from "../api/lab";
import { errorMessage } from "../api/errors";
import { Icon } from "../components/Icon";
import { ModelApprovalPanel, MonitorPanel } from "../components/LabDeploy";
import { useAuth } from "../context/AuthContext";
import { formatDateTime } from "../format";
import { featureDisplayName, featureExplanation, patternTitle } from "../explanations";
import type {
  LabCurvePoint,
  LabDataset,
  LabMappingIn,
  LabModelResult,
  LabModelsResponse,
  LabOptions,
  LabRun,
  LabSavedModel,
} from "../types/lab";
import "../lab.css";

const WRITER_ROLES = ["ROLE_DATA_OPS", "ROLE_ANALYST"];
const POSITIVE_DEFAULTS = new Set(["1", "true", "yes", "y", "t", "fraud", "ya"]);
const BINARY_PAIRS: Record<string, string> = {
  "1": "0", "0": "1", true: "false", false: "true", yes: "no", no: "yes",
  y: "n", n: "y", t: "f", f: "t", ya: "tidak", tidak: "ya",
};
const NONE = "";
const MODEL_HELP: Record<string, string> = {
  logistic_regression: "Menimbang indikator satu per satu untuk membandingkan pola dengan jawaban acuan.",
  lightgbm: "Mempelajari gabungan beberapa indikator dari contoh yang sudah memiliki jawaban acuan.",
  isolation_forest: "Mencari contoh yang paling berbeda dari kelompok lainnya. Berbeda belum tentu berarti bermasalah.",
};
const GROUP_HELP: Record<string, string> = {
  nominal: "Nilai transaksi dan arah dana: masuk atau keluar.",
  riwayat: "Jumlah, nilai, dan jeda transaksi sebelumnya pada rekening yang sama.",
  penyimpangan: "Perbandingan dengan kebiasaan rekening sendiri. Pembanding ini belum tersedia jika riwayat belum cukup.",
  kecepatan: "Jumlah transaksi dan dana keluar dalam satu jam atau 24 jam terakhir.",
  waktu: "Jam transaksi, jika waktu dan zona waktunya tersedia.",
  kanal: "Seberapa sering kanal yang sama muncul dalam contoh pelatihan.",
  kebaruan: "Apakah perangkat, alamat jaringan (IP), lokasi, atau merchant baru pertama kali terlihat pada rekening tersebut.",
  sesi: "Informasi sesi yang disediakan sumber, seperti percobaan masuk, durasi, dan saldo tercatat.",
};
const FIELD_NOTES: Record<string, string> = {
  transaction_type: "Jenis aktivitas yang dicatat sumber, misalnya transfer atau pembayaran.",
  device_ref: "Kode pengenal perangkat yang digunakan. Bukan nama pemilik perangkat.",
  merchant_ref: "Kode toko atau merchant yang terkait dengan transaksi.",
  ip_address: "Alamat jaringan (IP) yang dicatat sumber saat transaksi atau sesi berlangsung.",
  location: "Lokasi yang dicatat sumber, misalnya kota. Aplikasi tidak menebak lokasi yang tidak tersedia.",
  counterparty_country: "Negara pihak lawan transaksi, menggunakan kode dua huruf pada sumber.",
  source_status: "Status transaksi yang dicatat sumber. Ini bukan hasil penilaian aplikasi.",
  login_attempts: "Banyaknya percobaan masuk yang dicatat sumber.",
  transaction_duration: "Lama transaksi yang dicatat sumber; pastikan satuannya dipahami sebelum memakai data.",
  account_balance: "Saldo rekening yang tercatat pada sumber data.",
};
const CATEGORY_NAMES: Record<string, string> = {
  ATO: "Contoh terkait pengambilalihan akun", VELOCITY: "Transaksi beruntun",
  STRUCTURING: "Pembagian nominal transaksi", MULE: "Aliran dana perantara",
  DORMANT: "Aktivitas setelah jeda", LOOKALIKE: "Contoh sah yang mirip pola",
  NORMAL: "Normal menurut review",
};
function categoryName(code: string): string {
  return CATEGORY_NAMES[code] ?? (/^P\d{2}$/.test(code) ? patternTitle(code) : code);
}

function binaryNegatives(values: string[], positives: string[]): string[] {
  const paired = new Set(positives.map((value) => BINARY_PAIRS[value.trim().toLowerCase()]).filter(Boolean));
  return values.filter((value) => paired.has(value.trim().toLowerCase()));
}

function pct(value: number | null | undefined, digits = 1): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${(100 * value).toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`
    : "–";
}

function num(value: number | null | undefined, digits = 0): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : "–";
}

function dec(value: number | null | undefined, digits = 3): string {
  return num(value, digits);
}

/** Model scores can crowd near 0 or 1, so show enough digits to tell neighbouring points apart. */
function threshold(value: number): string {
  const digits = value >= 0.01 && value <= 0.99 ? 4 : 6;
  return Number(value.toPrecision(digits)).toLocaleString("id-ID", { maximumSignificantDigits: digits });
}

function dateOnly(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("id-ID", { dateStyle: "medium" }) : "–";
}

function kindLabel(kind: string): string {
  return kind === "supervised" ? "Belajar dari jawaban acuan" : "Belajar dari pola data";
}

function EvaluationGuide() {
  return <details className="lab-glossary">
    <summary><Icon name="info" size={17} /> Cara membaca hasil pengujian</summary>
    <dl>
      <div><dt>Ketepatan (precision)</dt><dd>Dari hasil yang ditandai, berapa bagian yang berlabel positif menurut jawaban acuan.</dd></div>
      <div><dt>Cakupan (recall)</dt><dd>Dari seluruh contoh berlabel positif, berapa bagian yang berhasil ditandai.</dd></div>
      <div><dt>Peringkat keseluruhan (AP)</dt><dd>Ringkasan kemampuan mengurutkan contoh positif pada berbagai batas penandaan. Dipakai untuk membandingkan model di data pembanding.</dd></div>
      <div><dt>Keseimbangan hasil (F1)</dt><dd>Ringkasan ketepatan dan cakupan. Titik F1 tertinggi pada data pembanding menjadi saran awal, bukan jaminan cocok untuk operasional.</dd></div>
    </dl>
    <p>Semua angka dibandingkan dengan label pada data simulasi. Angka ini tidak menunjukkan peluang suatu transaksi melakukan kejahatan.</p>
  </details>;
}

// --- stepper -------------------------------------------------------------------------------------

const STEPS = [
  { title: "Siapkan contoh", hint: "Unggah data berlabel" },
  { title: "Cocokkan kolom", hint: "Kenali isi data" },
  { title: "Pelajari pola", hint: "Bandingkan pendekatan" },
  { title: "Lihat hasil", hint: "Pilih batas penandaan" },
  { title: "Simpan rancangan", hint: "Kunci uji akhir" },
  { title: "Minta persetujuan", hint: "Ditinjau orang kedua" },
  { title: "Periksa data baru", hint: "Pakai versi disetujui" },
];

function Stepper({ reached, onStep }: { reached: number; onStep: (index: number) => void }) {
  return (
    <ol className="lab-stepper" aria-label="Langkah lab model">
      {STEPS.map((step, index) => {
        const state = index < reached ? "is-done" : index === reached ? "is-current" : "is-locked";
        return (
          <li key={step.title} className={`lab-step ${state}`} aria-current={index === reached ? "step" : undefined}>
            <button type="button" onClick={() => onStep(index)} disabled={index > reached && index < 5} aria-label={`Langkah ${index + 1}: ${step.title}`}>
              <span className="lab-step-number">{index < reached ? <Icon name="check" size={14} /> : index + 1}</span>
              <span><strong>{step.title}</strong><small>{step.hint}</small></span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function ProgressNavigation({ reached, onStep }: { reached: number; onStep: (index: number) => void }) {
  const current = Math.min(reached, STEPS.length - 1);
  return <>
    <div className="lab-desktop-progress"><Stepper reached={reached} onStep={onStep} /></div>
    <div className="lab-mobile-progress">
      <details>
        <summary>
          <span className="lab-mobile-progress-number">{reached >= STEPS.length ? <Icon name="check" size={17} /> : current + 1}</span>
          <span><small>Langkah {current + 1} dari {STEPS.length}</small><strong>{reached >= STEPS.length ? "Unggahan baru selesai diperiksa" : STEPS[current].title}</strong><span className="lab-progress-expand">Lihat semua langkah</span><span className="lab-progress-collapse">Sembunyikan langkah</span></span>
          <Icon name="chevron" size={18} />
        </summary>
        <Stepper reached={reached} onStep={onStep} />
      </details>
    </div>
  </>;
}

// --- step 1: dataset -----------------------------------------------------------------------------

function DatasetStep({
  options,
  datasets,
  selectedId,
  canWrite,
  onSelect,
}: {
  options: LabOptions;
  datasets: LabDataset[];
  selectedId: string | null;
  canWrite: boolean;
  onSelect: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState("");
  const upload = useMutation({
    mutationFn: () => uploadLabDataset(file as File, name),
    onSuccess: (dataset) => {
      queryClient.setQueryData(["lab-dataset", dataset.id], dataset);
      void queryClient.invalidateQueries({ queryKey: ["lab-datasets"] });
      setFile(null);
      setName("");
      if (fileInput.current) fileInput.current.value = "";
      onSelect(dataset.id);
    },
  });
  const maxMb = Math.round(options.max_upload_bytes / (1024 * 1024));

  function choose(candidate: File | undefined) {
    setFileError("");
    upload.reset();
    if (!candidate) return;
    if (!/\.(csv|parquet)$/i.test(candidate.name) || candidate.size > options.max_upload_bytes) {
      setFileError(
        candidate.size > options.max_upload_bytes
          ? `File melebihi batas ${maxMb} MB.`
          : "Pilih file berformat .csv atau .parquet.",
      );
      return;
    }
    setFile(candidate);
  }

  return (
    <section className="card lab-section" aria-labelledby="lab-step-1">
      <div className="section-head">
        <div>
          <span className="section-kicker">LANGKAH 1</span>
          <h2 id="lab-step-1">Mulai dari contoh yang sudah ditinjau</h2>
          <p>Unggah kumpulan transaksi beserta hasil review. Jawaban acuan ini membantu sistem mempelajari dan membandingkan pola.</p>
        </div>
        <span className="badge badge-blue">CSV / Parquet · {maxMb} MB</span>
      </div>
      <div className="lab-dataset-grid">
        {canWrite && (
          <form
            className="lab-upload"
            onSubmit={(event) => {
              event.preventDefault();
              if (file && !upload.isPending) upload.mutate();
            }}
          >
            <div
              className={`upload-drop ${dragging ? "is-dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                choose(event.dataTransfer.files[0]);
              }}
            >
              <Icon name={file ? "file" : "upload"} size={24} />
              <div>
                <strong>{file ? file.name : "Pilih kumpulan contoh transaksi"}</strong>
                <p>
                  {file
                    ? `${(file.size / (1024 * 1024)).toLocaleString("id-ID", { maximumFractionDigits: 2 })} MB · siap diunggah`
                    : "CSV atau Parquet: satu baris per transaksi, dengan kolom hasil review (label)."}
                </p>
                <label htmlFor="lab-file" className="file-select">
                  {file ? "Ganti file" : "Pilih dari perangkat"}
                </label>
                <input
                  id="lab-file"
                  ref={fileInput}
                  className="sr-only"
                  type="file"
                  accept=".csv,text/csv,.parquet"
                  onChange={(event) => choose(event.target.files?.[0])}
                />
              </div>
            </div>
            <label>
              Nama kumpulan contoh
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Opsional, misalnya: Sintetis FCIP 100 ribu"
              />
            </label>
            <button type="submit" disabled={!file || upload.isPending}>
              <Icon name="upload" size={16} />
              {upload.isPending ? "Membaca contoh transaksi..." : "Unggah contoh transaksi"}
            </button>
            {fileError && <p className="error" role="alert">{fileError}</p>}
            {upload.error && <p className="error" role="alert">{errorMessage(upload.error)}</p>}
          </form>
        )}
        <div className="lab-dataset-list">
          <h3>Atau lanjutkan contoh tersimpan</h3>
          {datasets.length === 0 ? (
            <p className="muted">Belum ada kumpulan contoh. {canWrite ? "Pilih file di sebelah untuk memulai." : "Petugas data atau analis dapat menambahkan contoh berlabel."}</p>
          ) : (
            <ul>
              {datasets.map((dataset) => (
                <li key={dataset.id}>
                  <button
                    type="button"
                    className={`lab-dataset-item ${dataset.id === selectedId ? "is-selected" : ""}`}
                    onClick={() => onSelect(dataset.id)}
                    aria-pressed={dataset.id === selectedId}
                  >
                    <span>
                      <strong>{dataset.name}</strong>
                      <small>
                        {dataset.file_format.toUpperCase()} · {num(dataset.row_count)} transaksi · {dataset.runs.length} percobaan ·{" "}
                        {formatDateTime(dataset.created_at)}
                      </small>
                    </span>
                    <span className={`badge ${dataset.status === "MAPPED" ? "badge-green" : "badge-amber"}`}>
                      {dataset.status === "MAPPED" ? "Kolom dicocokkan" : "Cocokkan kolom"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

// --- step 2: mapping -----------------------------------------------------------------------------

function initialMapping(dataset: LabDataset): LabMappingIn {
  if (dataset.mapping) return dataset.mapping;
  const s = dataset.suggestion;
  return {
    fields: { ...s.fields },
    label_column: s.label_column ?? "",
    positive_values: s.positive_values,
    negative_values: s.negative_values,
    category_column: s.category_column,
    date_format: s.date_format,
    default_currency: null,
  };
}

function MappingStep({ options, dataset, canWrite }: { options: LabOptions; dataset: LabDataset; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const mappingLocked = dataset.evaluation?.state !== "UNCONFIGURED";
  const editable = canWrite && !mappingLocked;
  const [form, setForm] = useState<LabMappingIn>(() => initialMapping(dataset));
  const [positiveText, setPositiveText] = useState(() => dataset.mapping?.positive_values.join(", ") ?? "");
  const [negativeText, setNegativeText] = useState(() => dataset.mapping?.negative_values?.join(", ") ?? "");
  useEffect(() => {
    setForm(initialMapping(dataset));
    setPositiveText(dataset.mapping?.positive_values.join(", ") ?? "");
    setNegativeText(dataset.mapping?.negative_values?.join(", ") ?? "");
    // Refresh the form when its source or immutable contract changes, not on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset.id, dataset.evaluation?.protocol_id]);
  const save = useMutation({
    mutationFn: (mapping: LabMappingIn) => saveLabMapping(dataset.id, mapping),
    onSuccess: (updated) => {
      queryClient.setQueryData(["lab-dataset", updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["lab-datasets"] });
    },
  });
  const labelValues = form.label_column ? dataset.suggestion.low_cardinality[form.label_column] : undefined;
  const reserved = new Set([form.label_column, form.category_column ?? ""].filter(Boolean));
  const validation = dataset.validation;
  const legacyLabels = mappingLocked && form.negative_values == null;

  function setField(key: string, column: string) {
    setForm((current) => ({ ...current, fields: { ...current.fields, [key]: column || null } }));
  }

  function setLabel(column: string) {
    const values = dataset.suggestion.low_cardinality[column] ?? [];
    const positives = values.filter((v) => POSITIVE_DEFAULTS.has(v.trim().toLowerCase()));
    setPositiveText("");
    setNegativeText("");
    setForm((current) => ({
      ...current,
      label_column: column,
      positive_values: positives,
      negative_values: binaryNegatives(values, positives),
      fields: Object.fromEntries(Object.entries(current.fields).filter(([, c]) => c !== column)),
    }));
  }

  function submit() {
    const positives = labelValues
      ? form.positive_values
      : positiveText.split(",").map((v) => v.trim()).filter(Boolean);
    save.mutate({
      ...form,
      positive_values: positives,
      negative_values: labelValues
        ? form.negative_values ?? binaryNegatives(labelValues, positives)
        : negativeText.split(",").map((v) => v.trim()).filter(Boolean),
      category_column: form.category_column || null,
      default_currency: form.default_currency?.trim() ? form.default_currency.trim().toUpperCase() : null,
    });
  }

  function fieldInput(field: LabOptions["fields"][number]) {
    return <label key={field.key} className="lab-mapping-row">
      <span>{field.label}{field.required && <em className="lab-required"> wajib</em>}{(field.help || FIELD_NOTES[field.key]) && <small>{field.help || FIELD_NOTES[field.key]}</small>}</span>
      <select value={form.fields[field.key] ?? NONE} onChange={(event) => setField(field.key, event.target.value)} disabled={!editable}>
        <option value={NONE}>— tidak ada —</option>
        {dataset.columns.filter((c) => !reserved.has(c)).map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>;
  }

  return (
    <section className="card lab-section" aria-labelledby="lab-step-2">
      <div className="section-head">
        <div>
          <span className="section-kicker">LANGKAH 2</span>
          <h2 id="lab-step-2">Bantu sistem mengenali isi kolom</h2>
          <p>Untuk <strong>{dataset.name}</strong>, pilih kolom yang berisi rekening, waktu, dan nominal. Lalu tentukan kolom hasil review sebagai jawaban acuan.</p>
        </div>
        <span className="badge badge-blue">{num(dataset.row_count)} baris · {dataset.columns.length} kolom</span>
      </div>

      {mappingLocked && <p className="notice lab-note">Susunan kolom sudah dikunci saat percobaan dimulai agar hasil dapat ditelusuri. Pemeriksaan data baru memakai susunan yang tersimpan pada model.</p>}

      <details className="lab-preview">
        <summary>Pratinjau 8 baris pertama</summary>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>{dataset.columns.map((c) => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {dataset.preview.map((row, i) => (
                <tr key={i}>{dataset.columns.map((c) => <td key={c} className="mono">{row[c]}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="lab-mapping-layout">
        <div className="lab-mapping">
          <h3>Isi transaksi</h3>
          {options.fields.filter((field) => field.required || field.key === "transaction_ref").map(fieldInput)}
          <details className="lab-optional-fields">
            <summary>Informasi tambahan dalam file</summary>
            <p className="small muted">Cocokkan jika tersedia, misalnya arah dana, mata uang, perangkat, atau merchant. Keterangan setiap kolom menjelaskan apa yang dilakukan bila datanya tidak tersedia.</p>
            {options.fields.filter((field) => !field.required && field.key !== "transaction_ref").map(fieldInput)}
          </details>
        </div>
        <div className="lab-mapping lab-mapping-side">
          <h3>Jawaban dari hasil review</h3>
          <p className="muted">Label adalah penilaian acuan yang sudah diberikan reviewer, bukan kesimpulan baru dari aplikasi.</p>
          <label>
            Kolom hasil review (label)
            <select value={form.label_column} onChange={(event) => setLabel(event.target.value)} disabled={!editable}>
              <option value={NONE}>— pilih kolom label —</option>
              {dataset.columns.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          {form.label_column && (
            <fieldset className="lab-positive">
              <legend>Arti jawaban dalam file</legend>
              <p className="muted" id="lab-label-help">Positif berarti masuk kategori target sesuai review; normal berarti label negatif menurut review. Label kosong tidak digunakan sebagai jawaban pelatihan. Kasus yang belum diputuskan jangan dimasukkan sebagai normal.</p>
              {legacyLabels && <p className="notice lab-note">Susunan kolom ini tidak menyimpan nilai negatif secara eksplisit. Susunan dan hasil percobaan tetap dikunci.</p>}
              {labelValues ? (
                labelValues.map((value) => (
                  <label key={value} className="inline">
                    <span className="mono">{value === "" ? "(kosong)" : value}</span>
                    <select
                      aria-label={`Arti label ${value || "kosong"}`}
                      aria-describedby="lab-label-help"
                      value={!value.trim() ? "" : form.positive_values.includes(value) ? "positive"
                        : (form.negative_values ?? binaryNegatives(labelValues, form.positive_values)).includes(value) ? "negative" : ""}
                      disabled={!editable || !value.trim()}
                      onChange={(event) => {
                        const kind = event.target.value;
                        setForm((current) => ({
                          ...current,
                          positive_values: [...current.positive_values.filter((v) => v !== value), ...(kind === "positive" ? [value] : [])],
                          negative_values: [...(current.negative_values ?? binaryNegatives(labelValues, current.positive_values)).filter((v) => v !== value), ...(kind === "negative" ? [value] : [])],
                        }));
                      }}
                    >
                      <option value="">{value.trim() ? "— belum dipetakan —" : "Tidak dipakai"}</option>
                      <option value="positive">Positif menurut review</option>
                      <option value="negative">Normal menurut review</option>
                    </select>
                  </label>
                ))
              ) : (
                <>
                  <label>Nilai positif, pisahkan dengan koma
                    <input value={positiveText} onChange={(event) => setPositiveText(event.target.value)} disabled={!editable} aria-describedby="lab-label-help" />
                  </label>
                  <label>Nilai normal, pisahkan dengan koma
                    <input value={negativeText} onChange={(event) => setNegativeText(event.target.value)} disabled={!editable} aria-describedby="lab-label-help" />
                  </label>
                </>
              )}
            </fieldset>
          )}
          <label>
            Jenis kasus / pola <small className="muted">Opsional. Hanya untuk membandingkan hasil tiap jenis kasus, bukan sebagai masukan model.</small>
            <select
              value={form.category_column ?? NONE}
              onChange={(event) => setForm((current) => ({ ...current, category_column: event.target.value || null }))}
              disabled={!editable}
            >
              <option value={NONE}>— tidak ada —</option>
              {dataset.columns.filter((c) => c !== form.label_column).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>
            Format tanggal
            <select
              value={form.date_format}
              onChange={(event) => setForm((current) => ({ ...current, date_format: event.target.value as "iso" | "month_first" }))}
              disabled={!editable}
            >
              <option value="iso">ISO · 2026-04-01 13:45:00</option>
              <option value="month_first">Bulan dulu · 04/01/2026</option>
            </select>
          </label>
          <label>
            Mata uang jika tidak ada di file <small className="muted">Contoh IDR untuk rupiah. Nominal tidak dikonversi ke mata uang lain.</small>
            <input
              value={form.default_currency ?? ""}
              maxLength={3}
              placeholder="mis. IDR atau USD"
              onChange={(event) => setForm((current) => ({ ...current, default_currency: event.target.value }))}
              disabled={!editable}
            />
          </label>
          {editable && (
            <button type="button" onClick={submit} disabled={save.isPending || !form.label_column}>
              <Icon name="scan" size={16} />
              {save.isPending ? "Memeriksa isi kolom..." : "Periksa kecocokan kolom"}
            </button>
          )}
          {save.error && <p className="error" role="alert">{errorMessage(save.error)}</p>}
        </div>
      </div>

      {validation && (
        <div className="lab-validation" role="status">
          <div className="lab-tiles">
            <div className="lab-tile">
              <span>Baris dapat dipakai</span>
              <strong>{num(validation.usable_rows)}</strong>
              <small>dari {num(validation.total_rows)} baris file</small>
            </div>
            <div className="lab-tile">
              <span>Positif menurut review</span>
              <strong>{num(validation.positives)}</strong>
              <small>{pct(validation.positive_rate, 2)} dari baris dipakai</small>
            </div>
            <div className="lab-tile">
              <span>Perlu diperbaiki</span>
              <strong>{num(validation.quarantined)}</strong>
              <small>baris dipisahkan agar kesalahannya dapat diperiksa</small>
            </div>
            <div className="lab-tile">
              <span>Periode data</span>
              <strong className="lab-tile-small">{dateOnly(validation.date_from)} – {dateOnly(validation.date_to)}</strong>
              <small>{num(validation.accounts)} akun · {validation.currency}</small>
            </div>
          </div>
          {validation.quarantine_reasons.length > 0 && (
            <details>
              <summary>Kenapa ada baris yang dipisahkan?</summary>
              <ul className="lab-reasons">
                {validation.quarantine_reasons.map((r) => (
                  <li key={r.reason}><span className="mono">{r.reason}</span> <strong>{num(r.rows)}</strong></li>
                ))}
              </ul>
            </details>
          )}
          {validation.category_counts && (
            <p className="small muted">
              Positif per jenis kasus: {Object.entries(validation.category_counts).map(([k, v]) => `${categoryName(k)} ${num(v)}`).join(" · ")}
            </p>
          )}
          {validation.notes.map((note) => <p key={note} className="notice lab-note">{note}</p>)}
          <p className={validation.ready ? "ok small" : "warn small"}>
            {validation.ready ? "Pemeriksaan awal data selesai. Lanjutkan ke langkah 3 untuk mempelajari pola; ini belum menilai kualitas deteksi." : "Contoh belum memenuhi syarat pelatihan. Periksa catatan di atas sebelum melanjutkan."}
          </p>
        </div>
      )}
    </section>
  );
}

// --- step 3: features & models -------------------------------------------------------------------

function TrainingStep({
  options,
  dataset,
  canWrite,
  onTrained,
}: {
  options: LabOptions;
  dataset: LabDataset;
  canWrite: boolean;
  onTrained: (run: LabRun) => void;
}) {
  const queryClient = useQueryClient();
  const [groups, setGroups] = useState<string[]>(() => options.feature_groups.filter((g) => g.default).map((g) => g.key));
  const [models, setModels] = useState<string[]>(() => options.models.filter((m) => m.default).map((m) => m.key));
  const [trainShare, setTrainShare] = useState(dataset.evaluation?.train_share ?? 0.6);
  const closed = ["REVEALED", "LEGACY_EXPOSED"].includes(dataset.evaluation?.state ?? "");
  const editable = canWrite && !closed;
  useEffect(() => {
    if (dataset.evaluation?.train_share != null) setTrainShare(dataset.evaluation.train_share);
  }, [dataset.id, dataset.evaluation?.train_share]);
  const train = useMutation({
    mutationFn: () => trainLabModels(dataset.id, { feature_groups: groups, models, train_share: trainShare }),
    onSuccess: (run) => {
      queryClient.setQueryData(["lab-run", run.id], run);
      void queryClient.invalidateQueries({ queryKey: ["lab-dataset", dataset.id] });
      void queryClient.invalidateQueries({ queryKey: ["lab-datasets"] });
      onTrained(run);
    },
  });
  const rest = (1 - trainShare) / 2;

  function toggle(list: string[], key: string, on: boolean): string[] {
    return on ? [...list, key] : list.filter((k) => k !== key);
  }

  return (
    <section className="card lab-section" aria-labelledby="lab-step-3">
      <div className="section-head">
        <div>
          <span className="section-kicker">LANGKAH 3</span>
          <h2 id="lab-step-3">Pilih informasi yang dipelajari</h2>
          <p>Sistem mencoba beberapa cara membaca pola (model). Pilihan awal sudah tersedia; buka pengaturan jika ingin mengubah informasi yang digunakan.</p>
        </div>
      </div>
      {dataset.evaluation?.state === "SEALED" && <p className="notice lab-note">Urutan periode dan susunan kolom sudah dikunci. Anda masih dapat membandingkan indikator dan model pada data pembanding sampai satu pilihan akhir disimpan.</p>}
      <div className="lab-config">
        <details className="lab-config-details">
          <summary><span><strong>Informasi yang dipakai untuk belajar</strong><small>{groups.length} kelompok dipilih · buka untuk menyesuaikan</small></span><Icon name="chevron" size={17} /></summary>
        <fieldset className="lab-checks">
          <legend>Kelompok indikator (fitur)</legend>
          {options.feature_groups.map((group) => (
            <label key={group.key} className={`lab-check ${groups.includes(group.key) ? "is-on" : ""}`}>
              <input
                type="checkbox"
                checked={groups.includes(group.key)}
                disabled={!editable || train.isPending}
                onChange={(event) => setGroups((current) => toggle(current, group.key, event.target.checked))}
              />
              <span>
                <strong>{group.label}</strong>
                <small>{GROUP_HELP[group.key] ?? group.description}</small>
              </span>
            </label>
          ))}
        </fieldset>
        </details>
        <div className="lab-config-side">
          <fieldset className="lab-checks">
            <legend>Pendekatan yang akan dibandingkan</legend>
            {options.models.map((model) => (
              <label key={model.key} className={`lab-check ${models.includes(model.key) ? "is-on" : ""}`}>
                <input
                  type="checkbox"
                  checked={models.includes(model.key)}
                  disabled={!editable || train.isPending}
                  onChange={(event) => setModels((current) => toggle(current, model.key, event.target.checked))}
                />
                <span>
                  <strong>
                    {model.name} <span className={`lab-kind lab-kind-${model.kind}`}>{kindLabel(model.kind)}</span>
                  </strong>
                  <small>{MODEL_HELP[model.key] ?? model.description}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="lab-share">
            Bagian contoh untuk belajar: {pct(trainShare, 0)}
            <input
              type="range"
              min={0.5}
              max={0.8}
              step={0.05}
              value={trainShare}
              disabled={!editable || train.isPending || dataset.evaluation?.state === "SEALED"}
              onChange={(event) => setTrainShare(Number(event.target.value))}
            />
            <small className="muted">
              Berdasarkan waktu: {pct(trainShare, 0)} contoh terlama untuk belajar, {pct(rest, 0)} untuk membandingkan pilihan, dan {pct(rest, 0)} terbaru disimpan untuk uji akhir.
            </small>
          </label>
          {editable ? (
            <button type="button" onClick={() => train.mutate()} disabled={train.isPending || !groups.length || !models.length}>
              <Icon name="activity" size={16} />
              {train.isPending ? "Mempelajari contoh..." : "Pelajari pola & bandingkan hasil"}
            </button>
          ) : (
            <p className="muted">Pelatihan dilakukan oleh petugas data atau analis. Hasil uji akhir pada file ini harus belum dibuka; hasil lama yang sudah terlihat tidak dapat dianggap sebagai uji baru.</p>
          )}
          {train.isPending && (
            <div className="processing-state" role="status">
              <span className="spinner" />
              Mempelajari {num(dataset.validation?.usable_rows)} contoh dengan {models.length} pendekatan. Waktu proses bergantung pada ukuran data dan perangkat; tunggu hingga hasil tersedia.
            </div>
          )}
          {train.error && <p className="error" role="alert">{errorMessage(train.error)}</p>}
        </div>
      </div>
    </section>
  );
}

// --- step 4: results & threshold -----------------------------------------------------------------

function CurveChart({ curve, index, defaultIndex }: { curve: LabCurvePoint[]; index: number; defaultIndex: number }) {
  const width = 560;
  const height = 170;
  const pad = { left: 34, right: 10, top: 10, bottom: 24 };
  const x = (i: number) => pad.left + (curve.length > 1 ? (i / (curve.length - 1)) * (width - pad.left - pad.right) : 0);
  const y = (v: number) => pad.top + (1 - v) * (height - pad.top - pad.bottom);
  function path(key: "precision" | "recall"): string {
    let d = "";
    let pen = false;
    curve.forEach((point, i) => {
      const value = point[key];
      if (value === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(value).toFixed(1)} `;
      pen = true;
    });
    return d;
  }
  return (
    <svg className="lab-chart" viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label="Ketepatan dan cakupan pada data pembanding untuk setiap batas penandaan; angka rinci tersedia di samping grafik">
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} className="lab-chart-grid" />
          <text x={pad.left - 6} y={y(v) + 4} textAnchor="end" className="lab-chart-label">{v * 100}%</text>
        </g>
      ))}
      <line x1={x(defaultIndex)} x2={x(defaultIndex)} y1={pad.top} y2={height - pad.bottom} className="lab-chart-default" />
      <path d={path("precision")} className="lab-chart-precision" />
      <path d={path("recall")} className="lab-chart-recall" />
      <line x1={x(index)} x2={x(index)} y1={pad.top} y2={height - pad.bottom} className="lab-chart-cursor" />
      <text x={pad.left} y={height - 6} className="lab-chart-label">Batas rendah · lebih banyak ditandai</text>
      <text x={width - pad.right} y={height - 6} textAnchor="end" className="lab-chart-label">Batas tinggi · lebih sedikit ditandai</text>
    </svg>
  );
}

function ResultsStep({ run, canWrite, onReview }: { run: LabRun; canWrite: boolean; onReview: () => void }) {
  const queryClient = useQueryClient();
  const results = run.results;
  const [modelKey, setModelKey] = useState(results.best_model);
  const model = results.models.find((m) => m.key === modelKey) ?? results.models[0];
  const [index, setIndex] = useState(model.default_index);
  const [saved, setSaved] = useState<LabSavedModel | null>(null);
  useEffect(() => {
    setModelKey(run.evaluation?.model_key ?? results.best_model);
    setSaved(null);
  }, [run.id, results.best_model, run.evaluation?.model_key]);
  useEffect(() => {
    setIndex(run.evaluation?.model_key === model.key && run.evaluation.threshold_index != null
      ? run.evaluation.threshold_index : model.default_index);
    setSaved(null);
  }, [model.key, model.default_index, run.evaluation?.model_key, run.evaluation?.threshold_index]);
  const save = useMutation({
    mutationFn: () => saveLabModel(run.id, model.key, index),
    onSuccess: (result) => {
      setSaved(result);
      void queryClient.invalidateQueries({ queryKey: ["lab-run", run.id] });
      void queryClient.invalidateQueries({ queryKey: ["models"] });
      void queryClient.invalidateQueries({ queryKey: ["lab-models"] });
      void queryClient.invalidateQueries({ queryKey: ["lab-dataset", run.dataset_id] });
      void queryClient.invalidateQueries({ queryKey: ["lab-datasets"] });
    },
  });
  const point = model.validation_curve[Math.min(index, model.validation_curve.length - 1)];
  const categories = useMemo(() => {
    const names = new Set<string>();
    results.models.forEach((m) => m.validation_by_category?.forEach((c) => names.add(c.category)));
    return [...names];
  }, [results.models]);
  const savedHere = run.saved_versions.filter((v) => v.model_key === model.key);
  const evaluation = run.evaluation;
  const final = evaluation?.selected_final;
  const locked = !!saved || ["REVEALED", "LEGACY_EXPOSED"].includes(evaluation?.state ?? "");

  return (
    <>
      <section className="card lab-section" aria-labelledby="lab-step-4">
        <div className="section-head">
          <div>
            <span className="section-kicker">LANGKAH 4</span>
            <h2 id="lab-step-4">Bagaimana hasilnya pada contoh pembanding?</h2>
            <p>
              Bandingkan pilihan menggunakan data pembanding (validasi). Contoh untuk uji akhir tetap disimpan sampai satu pilihan dikunci.
            </p>
          </div>
        </div>
        {evaluation?.state === "LEGACY_EXPOSED" && <p className="notice lab-note">Percobaan lama ini sudah menampilkan hasil uji. Hasilnya tetap dapat dibaca sebagai riwayat, tetapi bukan uji akhir yang baru.</p>}
        {evaluation?.state === "REVEALED" && <p className="notice lab-note">Pilihan akhir untuk file ini sudah dikunci. Hasil pembanding tetap dapat dibaca; model dan batas penandaannya tidak dapat diganti.</p>}
        <EvaluationGuide />
        <div className="lab-split">
          {(["train", "validation", "test"] as const).map((part) => (
            <div key={part} className="lab-split-part">
              <span>{part === "train" ? "1. Belajar dari contoh" : part === "validation" ? "2. Membandingkan pilihan" : "3. Uji akhir tersimpan"}</span>
              <strong>{num(results.split[part].rows)} baris</strong>
              <small>
                {part !== "test" ? `${num(results.split[part].positives)} berlabel positif · ` : "jawaban uji disimpan · "}{dateOnly(results.split[part].date_from)} – {dateOnly(results.split[part].date_to)}
              </small>
            </div>
          ))}
        </div>
        <div className="table-scroll">
          <table className="table lab-compare">
            <thead>
              <tr>
                <th>Model</th>
                <th>Cara belajar</th>
                <th className="num">Peringkat (AP)</th>
                <th className="num">Ketepatan</th>
                <th className="num">Cakupan</th>
                <th className="num">Ditandai / 10.000 transaksi</th>
                <th className="num">Lama belajar</th>
              </tr>
            </thead>
            <tbody>
              {results.models.map((m: LabModelResult) => (
                <tr key={m.key} className={m.key === results.best_model ? "is-best" : ""}>
                  <td>
                    <strong>{m.name}</strong>
                    {m.key === results.best_model && <span className="badge badge-blue lab-best">AP tertinggi pada pembanding</span>}
                  </td>
                  <td><span className={`lab-kind lab-kind-${m.kind}`}>{kindLabel(m.kind)}</span></td>
                  <td className="num">{dec(m.validation_ranking.average_precision)}</td>
                  <td className="num">{pct(m.validation_curve[m.default_index].precision)}</td>
                  <td className="num">{pct(m.validation_curve[m.default_index].recall)}</td>
                  <td className="num">{num(m.validation_curve[m.default_index].flagged_per_10k, 0)}</td>
                  <td className="num">{num(m.seconds, 1)} s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted lab-footnote">
          Ketepatan dan cakupan memakai batas awal masing-masing model pada data pembanding. AP membantu mengurutkan model;
          hasil uji akhir hanya dibuka untuk satu pasangan model dan batas penandaan. Percobaan {formatDateTime(run.created_at)} · {num(run.seconds, 1)} detik.
        </p>
        {results.positive_category_coverage?.train && (
          <p className="notice lab-note">
            Contoh positif yang tersedia untuk belajar: {Object.entries(results.positive_category_coverage.train).map(([name, count]) => `${categoryName(name)} ${num(count)}`).join(" · ") || "tidak ada kategori"}.
            {" "}Pada pembanding: {Object.entries(results.positive_category_coverage.validation ?? {}).map(([name, count]) => `${categoryName(name)} ${num(count)}`).join(" · ") || "tidak ada kategori"}.
          </p>
        )}
        {categories.length > 0 && (
          <div className="table-scroll">
            <table className="table lab-categories">
              <thead>
                <tr>
                  <th>Jenis kasus pada pembanding · batas awal</th>
                  {results.models.map((m) => <th key={m.key} className="num">{m.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category}>
                    <td>{categoryName(category)}<small className="lab-category-code mono">{category}</small></td>
                    {results.models.map((m) => {
                      const c = m.validation_by_category?.find((x) => x.category === category);
                      return (
                        <td key={m.key} className="num">
                          {c ? `${num(c.caught)} / ${num(c.positives)} tertangkap` : "–"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <details className="lab-features-used">
          <summary>
            Lihat {results.features.used.length} indikator yang dipakai
            {results.features.unusable.length > 0 && ` · ${results.features.unusable.length} tidak tersedia pada contoh ini`}
          </summary>
          <p className="small">
            <strong>Dipakai:</strong> {results.features.used.map(featureDisplayName).join(", ")}
          </p>
          {results.features.unusable.length > 0 && (
            <p className="small muted">
              <strong>Tidak memiliki variasi atau tidak tersedia:</strong> {results.features.unusable.map(featureDisplayName).join(", ")}
            </p>
          )}
        </details>
      </section>

      <section className="card lab-section" aria-labelledby="lab-threshold">
        <div className="section-head">
          <div>
            <span className="section-kicker">LANGKAH 4 · BATAS PENANDAAN</span>
            <h2 id="lab-threshold">Tentukan kapan hasil perlu ditinjau</h2>
            <p>
              Batas penandaan (threshold) adalah skor minimum untuk menandai hasil. Menurunkannya dapat menambah hasil yang ditandai;
              menaikkannya dapat melewatkan lebih banyak contoh positif. Pilih menggunakan hasil pembanding di bawah.
            </p>
          </div>
          <div className="lab-model-tabs" role="group" aria-label="Pilih model yang dibandingkan">
            {results.models.map((m) => (
              <button
                key={m.key}
                type="button"
                disabled={save.isPending || locked}
                aria-pressed={m.key === model.key}
                className={m.key === model.key ? "is-active" : "button-secondary"}
                onClick={() => setModelKey(m.key)}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
        <div className="lab-threshold-layout">
          <div>
            <CurveChart curve={model.validation_curve} index={index} defaultIndex={model.default_index} />
            <div className="lab-legend small">
              <span className="lab-legend-precision">Ketepatan</span>
              <span className="lab-legend-recall">Cakupan</span>
              <span className="lab-legend-default">Saran awal (F1 tertinggi)</span>
            </div>
            <label className="lab-slider">
              Batas penandaan: {threshold(point.threshold)} · pilihan {index + 1} dari {model.validation_curve.length}
              <input
                type="range"
                min={0}
                max={model.validation_curve.length - 1}
                step={1}
                value={index}
                disabled={locked || save.isPending}
                onChange={(event) => {
                  setIndex(Number(event.target.value));
                  setSaved(null);
                }}
              />
            </label>
            <div className="lab-slider-actions">
              <button type="button" className="button-secondary" disabled={locked || save.isPending} onClick={() => setIndex(model.default_index)}>
                Gunakan saran awal
              </button>
            </div>
          </div>
          <div className="lab-metrics">
            <div className="lab-metric">
              <span>Ketepatan penandaan</span>
              <strong>{pct(point.precision)}</strong>
              <small>hasil ditandai yang cocok dengan label positif</small>
            </div>
            <div className="lab-metric">
              <span>Cakupan kasus positif</span>
              <strong>{pct(point.recall)}</strong>
              <small>dari kasus positif, yang tertangkap</small>
            </div>
            <div className="lab-metric">
              <span>Ditandai per 10.000 transaksi</span>
              <strong>{num(point.flagged_per_10k, 0)}</strong>
              <small>perkiraan jumlah transaksi untuk ditinjau</small>
            </div>
            <p className="lab-plain">
              Dari <strong>{num(point.flagged)}</strong> transaksi yang ditandai pada pembanding, <strong>{num(point.tp)}</strong> berlabel
              positif dan <strong>{num(point.fp)}</strong> berlabel normal menurut review. Ada <strong>{num(point.fn)}</strong> contoh positif yang terlewat.
            </p>
            {!!model.validation_category_curve?.[index]?.length && (
              <div className="small">
                <strong>Kasus yang ditemukan pada batas ini · pembanding</strong>
                {model.validation_category_curve[index].map((c) => (
                  <p key={c.category}>{categoryName(c.category)}: {num(c.caught)} / {num(c.positives)} positif ditemukan.</p>
                ))}
              </div>
            )}
            {model.top_features.length > 0 && (
              <div className="lab-top-features">
                <h3>Informasi yang paling dipakai model</h3>
                <ol>
                  {model.top_features.slice(0, 5).map((f) => (
                    <li key={f.feature} title={featureExplanation(f.feature)}>
                      <span>{featureDisplayName(f.feature)}</span>
                      <span className="lab-bar"><span style={{ width: `${Math.max(4, 100 * f.share)}%` }} /></span>
                      <small>{pct(f.share, 0)}</small>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {model.kind === "unsupervised" && (
              <p className="notice lab-note">
                Isolation Forest mempelajari pola tanpa jawaban acuan. Label hanya dipakai untuk memilih saran batas dan membandingkan hasilnya.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="card lab-section" aria-labelledby="lab-step-5">
        <div className="section-head">
          <div>
            <span className="section-kicker">LANGKAH 5</span>
            <h2 id="lab-step-5">Simpan satu pilihan untuk ditinjau</h2>
            <p>Model dan batas pilihan Anda disimpan sebagai rancangan. Penanggung jawab kepatuhan (MLRO) perlu menyetujuinya sebelum dipakai pada transaksi baru.</p>
          </div>
        </div>
        <div className="lab-save">
          <dl className="facts">
            <dt>Model</dt>
            <dd>{model.name} · {kindLabel(model.kind)}</dd>
            <dt>Batas penandaan</dt>
            <dd className="mono">{threshold(point.threshold)}{index === model.default_index ? " (saran awal)" : ""}</dd>
            <dt>Pada pembanding</dt>
            <dd>ketepatan {pct(point.precision)} · cakupan {pct(point.recall)} · {num(point.flagged_per_10k, 0)} ditandai / 10.000 transaksi</dd>
            <dt>Contoh sumber</dt>
            <dd>{run.dataset_name}</dd>
          </dl>
          <p className="notice lab-note">Menyimpan akan mengunci pilihan ini dan membuka satu hasil uji akhir. Sesudahnya model, batas, dan pelatihan pada file yang sama tidak dapat diganti. Skor model bukan persentase kemungkinan fraud.</p>
          {canWrite && (
            <button type="button" onClick={() => save.mutate()} disabled={save.isPending || locked}>
              <Icon name="check" size={16} />
              {save.isPending ? "Mengunci pilihan & menguji..." : locked ? "Pilihan akhir sudah dikunci" : "Kunci pilihan & simpan rancangan"}
            </button>
          )}
          {save.error && <p className="error" role="alert">{errorMessage(save.error)}</p>}
          {saved && !final && (
            <div className="lab-saved" role="status">
              <p>
                <strong>{saved.already_saved ? "Sudah tersimpan sebelumnya" : "Tersimpan"}</strong> sebagai{" "}
                <span className="mono">{saved.version}</span> <span className="badge badge-amber">{saved.state}</span>
              </p>
              <p>
                Hasil <strong>uji akhir</strong> pada batas ini: ketepatan {pct(saved.test.precision)} · cakupan{" "}
                {pct(saved.test.recall)} · {num(saved.test.flagged_per_10k, 0)} ditandai / 10.000 transaksi.
              </p>
              <p className="small muted">
                Rancangan belum dipakai memeriksa transaksi baru. Selanjutnya analis mengajukannya, penanggung jawab lain menyetujui
                (langkah 6), lalu petugas data mengunggah transaksi baru (langkah 7).
              </p>
              <div className="lab-saved-links">
                <a href="#lab-step-6" className="btn-link" onClick={onReview}>
                  Ke persetujuan model <Icon name="arrow-right" size={14} />
                </a>
                <Link to="/model-flags" className="btn-link button-secondary">
                  Lihat hasil otomatis
                </Link>
              </div>
            </div>
          )}
          {final && (
            <div className="lab-saved" role="status">
              <strong>Uji akhir sudah dikunci · {final.version}</strong>
              <p>Ketepatan {pct(final.at_threshold.precision)} · cakupan {pct(final.at_threshold.recall)} · {num(final.at_threshold.flagged_per_10k)} ditandai / 10.000 transaksi.</p>
              {final.by_category?.map((c) => <p key={c.category} className="small">{categoryName(c.category)}: {num(c.caught)} / {num(c.positives)} positif ditemukan.</p>)}
            </div>
          )}
          {!saved && savedHere.length > 0 && (
            <p className="small muted">
              Versi tersimpan dari percobaan ini: {savedHere.map((v) => v.version).join(", ")}
            </p>
          )}
        </div>
      </section>
    </>
  );
}

// --- page ----------------------------------------------------------------------------------------

/** How far the selected dataset has come through the seven steps (0-based index of the current one). */
function stepReached(
  ready: boolean,
  hasDataset: boolean,
  run: LabRun | null,
  models: LabModelsResponse | undefined,
  datasetId: string | null,
  monitored: string | null,
): number {
  if (!hasDataset) return 0;
  if (!ready) return 1;
  const own = (models?.items ?? []).filter((v) => v.dataset_id === datasetId);
  if (own.some((v) => v.state === "ACTIVE")) return monitored === datasetId ? 7 : 6;
  if (own.some((v) => v.state === "PENDING_APPROVAL")) return 5;
  if (own.some((v) => v.state === "DRAFT") || run?.saved_versions.length) return 4;
  return run ? 3 : 2;
}

export function LabPage() {
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState<"prepare" | "use">(() => user?.role === "ROLE_MLRO" ? "use" : "prepare");
  const canWrite = !!user && WRITER_ROLES.includes(user.role);
  const options = useQuery({ queryKey: ["lab-options"], queryFn: fetchLabOptions, staleTime: Infinity });
  const datasets = useQuery({ queryKey: ["lab-datasets"], queryFn: fetchLabDatasets });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedId && datasets.data?.length) setSelectedId(datasets.data[0].id);
  }, [datasets.data, selectedId]);
  const dataset = useQuery({
    queryKey: ["lab-dataset", selectedId],
    queryFn: () => fetchLabDataset(selectedId as string),
    enabled: !!selectedId,
  });
  useEffect(() => {
    setRunId(dataset.data?.runs[0]?.id ?? null);
    // Only when another dataset is opened; a new run sets runId itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset.data?.id]);
  const run = useQuery({
    queryKey: ["lab-run", runId],
    queryFn: () => fetchLabRun(runId as string),
    enabled: !!runId,
  });
  const labModels = useQuery({ queryKey: ["lab-models"], queryFn: fetchLabModels });
  const [monitored, setMonitored] = useState<string | null>(null);
  const ready = dataset.data?.status === "MAPPED" && !!dataset.data.validation?.ready;
  const reached = stepReached(ready, !!dataset.data, run.data ?? null, labModels.data, selectedId, monitored);
  const selectedModels = (labModels.data?.items ?? []).filter((version) => version.dataset_id === selectedId);
  const activeModel = selectedModels.find((version) => version.state === "ACTIVE");
  const pendingModel = selectedModels.find((version) => version.state === "PENDING_APPROVAL");
  const draftModel = selectedModels.find((version) => version.state === "DRAFT");

  function goToStep(index: number) {
    setWorkspace(index < 5 ? "prepare" : "use");
    window.requestAnimationFrame(() => document.getElementById(`lab-step-${index + 1}`)?.scrollIntoView({ block: "start" }));
  }

  return (
    <div className="lab-page">
      <div className="page-header">
        <div>
          <span className="page-kicker">ATUR DETEKSI</span>
          <h1>Pemeriksaan otomatis, langkah demi langkah</h1>
          <p>Siapkan contoh, bandingkan hasil, lalu minta persetujuan sebelum pemeriksaan digunakan pada transaksi baru.</p>
        </div>
        <Link to="/guide#istilah" className="btn-link button-secondary"><Icon name="info" size={17} /> Panduan istilah</Link>
      </div>
      <div className="lab-welcome">
        <span className="lab-welcome-icon"><Icon name="layers" size={28} /></span>
        <div><h2>Model adalah cara sistem membaca pola.</h2><p>Model memberi skor berdasarkan contoh. Hasil yang ditandai perlu ditinjau manusia; status aktif belum menjamin ketepatan.</p></div>
        <span className="badge badge-blue">Lingkungan simulasi</span>
      </div>
      <div className="lab-workspace-tabs" role="group" aria-label="Bagian pengaturan deteksi">
        <button type="button" className={workspace === "prepare" ? "is-active" : "button-secondary"} aria-pressed={workspace === "prepare"} onClick={() => setWorkspace("prepare")}>
          <span className="lab-workspace-number">01</span><span><strong>Siapkan & uji</strong><small>Contoh, kolom, dan perbandingan hasil</small></span>
        </button>
        <button type="button" className={workspace === "use" ? "is-active" : "button-secondary"} aria-pressed={workspace === "use"} onClick={() => setWorkspace("use")}>
          <span className="lab-workspace-number">02</span><span><strong>Setujui & gunakan</strong><small>Persetujuan dan pemeriksaan data baru</small></span>
        </button>
      </div>
      {(activeModel || pendingModel || draftModel) && <div className="lab-current-status">
        <Icon name={activeModel ? "check" : pendingModel ? "clock" : "file"} size={21} />
        <div><strong>Status contoh ini: {activeModel ? "model sudah aktif" : pendingModel ? "menunggu persetujuan" : "rancangan tersimpan"}</strong><p>{activeModel ? "Versi yang disetujui dapat memeriksa unggahan baru. Status aktif tidak menjamin ketepatan deteksi." : pendingModel ? "Pengajuan perlu ditinjau penanggung jawab kepatuhan yang berbeda dari pengaju." : "Rancangan perlu diajukan analis sebelum ditinjau penanggung jawab kepatuhan."}</p></div>
        <button type="button" className="button-secondary" onClick={() => goToStep(activeModel && ready ? 6 : 5)}>{activeModel && ready ? "Periksa data baru" : pendingModel && user?.role === "ROLE_MLRO" ? "Tinjau pengajuan" : draftModel && !pendingModel && user?.role === "ROLE_ANALYST" ? "Ajukan rancangan" : "Lihat persetujuan"}<Icon name="arrow-right" size={16} /></button>
      </div>}
      <ProgressNavigation reached={reached} onStep={goToStep} />
      {(options.isPending || datasets.isPending) && <p className="loading-text" role="status">Memuat pengaturan pemeriksaan...</p>}
      {(options.error || datasets.error) && (
        <p className="error" role="alert">{errorMessage(options.error ?? datasets.error)}</p>
      )}
      {options.data && datasets.data && (
        <>
          <div hidden={workspace !== "prepare"} className="lab-workspace-panel">
          <DatasetStep
            options={options.data}
            datasets={datasets.data}
            selectedId={selectedId}
            canWrite={canWrite}
            onSelect={(id) => setSelectedId(id)}
          />
          {dataset.error && <p className="error" role="alert">{errorMessage(dataset.error)}</p>}
          {dataset.data && <MappingStep options={options.data} dataset={dataset.data} canWrite={canWrite} />}
          {dataset.data && ready && (
            <TrainingStep
              options={options.data}
              dataset={dataset.data}
              canWrite={canWrite}
              onTrained={(trained) => setRunId(trained.id)}
            />
          )}
          {dataset.data && ready && dataset.data.runs.length > 1 && (
            <label className="lab-run-picker">
              Percobaan yang ditampilkan
              <select value={runId ?? ""} onChange={(event) => setRunId(event.target.value)}>
                {dataset.data.runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {formatDateTime(r.created_at)} · {r.models.length} model · AP tertinggi: {r.best_model}
                  </option>
                ))}
              </select>
            </label>
          )}
          {run.isFetching && !run.data && <p className="loading-text" role="status">Memuat hasil percobaan...</p>}
          {run.error && <div className="card error" role="alert">
            <h2>Hasil percobaan belum dapat dibuka</h2>
            <p>{errorMessage(run.error)}</p>
            <p>Contoh yang dipilih tetap tersimpan. Coba muat hasil lagi sebelum membandingkan atau menyimpan pilihan.</p>
            <button type="button" className="button-secondary" onClick={() => void run.refetch()}>Coba muat hasil lagi</button>
          </div>}
          {run.data && ready && <ResultsStep run={run.data} canWrite={canWrite} onReview={() => goToStep(5)} />}
          </div>
          <div hidden={workspace !== "use"} className="lab-workspace-panel">
          {labModels.error && <p className="error" role="alert">{errorMessage(labModels.error)}</p>}
          {labModels.data && <ModelApprovalPanel data={labModels.data} role={user?.role} datasetId={selectedId} />}
          {labModels.data && dataset.data && ready && (
            <MonitorPanel
              dataset={dataset.data}
              models={labModels.data}
              canMonitor={user?.role === "ROLE_DATA_OPS"}
              maxBytes={options.data.max_upload_bytes}
              onResult={() => setMonitored(dataset.data?.id ?? null)}
            />
          )}
          {(!dataset.data || !ready) && <div className="card lab-next-help"><Icon name="info" size={23} /><div><h2>Pilih contoh yang kolomnya sudah cocok</h2><p>Untuk memeriksa data baru, petugas data perlu membuka kumpulan contoh yang sudah disiapkan. Persetujuan rancangan yang tersedia tetap dapat ditinjau di atas.</p><button type="button" className="button-secondary" onClick={() => setWorkspace("prepare")}>Ke penyiapan contoh <Icon name="arrow-right" size={16} /></button></div></div>}
          </div>
        </>
      )}
    </div>
  );
}
