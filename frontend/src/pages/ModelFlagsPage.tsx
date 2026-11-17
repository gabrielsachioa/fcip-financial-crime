import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { errorMessage } from "../api/errors";
import { fetchModels, fetchScores } from "../api/ml";
import { Icon } from "../components/Icon";
import { ModelSignals } from "../components/ModelSignals";
import { SignalNotice } from "../components/Notices";
import { scoreNumber } from "../explanations";
import type { ModelUnit, ModelVersionOut } from "../types";
import "../analysis.css";

const PAGE_SIZE = 50;
const MODEL_TABS: { value: ModelUnit | ""; label: string }[] = [
  { value: "", label: "Semua hasil" },
  { value: "FRAUD", label: "Per transaksi" },
  { value: "AML", label: "Per minggu" },
];
const STATE_LABELS: Record<string, string> = {
  DRAFT: "Rancangan", ACTIVE: "Sedang dipakai", PENDING_APPROVAL: "Menunggu persetujuan",
  SUSPENDED: "Dihentikan sementara", RETIRED: "Sudah diganti", IN_SIMULATION: "Dalam simulasi",
};

function validationValue(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(3)
    : "—";
}

function validationPercent(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${(100 * value).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
    : "—";
}

function ModelCard({ model }: { model: ModelVersionOut }) {
  const isWeekly = model.unit === "AML";
  // Lab drafts are measured against labels whatever their learning type.
  const lab = model.artefact_type.startsWith("LAB_");
  const unsupervised =
    !lab &&
    (model.training_kind === "unsupervised" ||
      model.score_kind === "anomaly_score");
  const stress = model.validation.synthetic_stress;
  return (
    <article className="card analysis-model-card">
      <div className="analysis-model-heading">
        <div>
          <p className="eyebrow">{isWeekly ? "Pemeriksaan mingguan" : "Pemeriksaan transaksi"}</p>
          <h3>
            {isWeekly
              ? unsupervised
                ? "Pola aktivitas rekening"
                : "Pola aktivitas nasabah"
              : "Pola tiap transaksi"}
          </h3>
        </div>
        <span
          className={`badge analysis-version-state ${model.state === "ACTIVE" ? "analysis-version-active" : ""}`}
        >
          {STATE_LABELS[model.state] ?? model.state}
        </span>
      </div>
      <p className="analysis-model-description">
        {isWeekly
          ? unsupervised
            ? "Merangkum aktivitas satu rekening dalam satu minggu. Rekening dipakai sebagai pengganti identitas nasabah pada data ini."
            : "Merangkum aktivitas satu nasabah dalam satu minggu."
          : "Memeriksa satu transaksi beserta riwayat yang tersedia saat transaksi terjadi."}
        {unsupervised &&
          " Metode ini mencari pola yang berbeda dari contoh lainnya. Skornya bukan persentase kemungkinan fraud."}
      </p>
      {model.state === "DRAFT" && (
        <p className="analysis-model-description">
          Masih berupa rancangan. Belum digunakan untuk memeriksa unggahan baru.
        </p>
      )}
      <div className="analysis-model-values">
        <div>
          <span>Nama versi pemeriksaan</span>
          <strong className="mono">{model.version}</strong>
        </div>
        <div>
          <span>Batas untuk ditandai</span>
          <strong className="analysis-threshold">
            {scoreNumber(model.threshold)}
          </strong>
        </div>
      </div>
      {unsupervised ? (
        <div className="analysis-validation">
          <p>
            Contoh sumber belum memiliki jawaban acuan{" "}
            <span>· {model.currency ?? "mata uang belum diketahui"}</span>
          </p>
          <p>
            Ketepatan dan cakupan deteksi belum bisa dinilai tanpa hasil review sebagai pembanding.
            Pengujian skenario buatan hanya menjelaskan hasil pada simulasi tersebut.
          </p>
          {stress && (
            <>
              <p>Hasil simulasi buatan · sebelum uji akhir</p>
              <dl>
                <div>
                  <dt>Ketepatan penandaan</dt>
                  <dd>{validationPercent(stress.precision)}</dd>
                </div>
                <div>
                  <dt>Cakupan kasus positif</dt>
                  <dd>{validationPercent(stress.recall)}</dd>
                </div>
                <div>
                  <dt>Ringkasan peringkat (AP)</dt>
                  <dd>{validationValue(stress.average_precision)}</dd>
                </div>
              </dl>
            </>
          )}
        </div>
      ) : (
        <div className="analysis-validation">
          <p>
            {model.state === "RETIRED"
              ? "Hasil pembanding terdahulu"
              : lab
                ? "Hasil pembanding pada batas tersimpan"
                : "Hasil pembanding internal"}{" "}
            <span>· data simulasi</span>
          </p>
          <dl>
            <div>
              <dt>Peringkat keseluruhan (AP)</dt>
              <dd>{validationValue(model.validation.average_precision)}</dd>
            </div>
            <div>
              <dt>Ketepatan penandaan</dt>
              <dd>{validationPercent(model.validation.precision)}</dd>
            </div>
            <div>
              <dt>Cakupan kasus positif</dt>
              <dd>{validationPercent(model.validation.recall)}</dd>
            </div>
          </dl>
        </div>
      )}
      <details className="analysis-model-reference">
        <summary>Asal data dan detail teknis</summary>
        <p>Ketepatan (precision) adalah bagian hasil yang ditandai dan berlabel positif. Cakupan (recall) adalah bagian contoh positif yang berhasil ditemukan. AP merangkum urutan skor pada berbagai batas. Angka ini bukan kepastian bahwa suatu transaksi adalah kejahatan.</p>
        <dl>
          <div>
            <dt>Satuan teknis</dt>
            <dd>{model.unit} · {isWeekly ? "rangkuman mingguan" : "satu transaksi"}. Nama satuan ini bukan keputusan tentang jenis kejahatan.</dd>
          </div>
          <div>
            <dt>Jenis model tersimpan</dt>
            <dd className="mono">{model.artefact_type}</dd>
          </div>
          {unsupervised && (
            <>
              <div>
                <dt>Cara belajar</dt>
                <dd>Tanpa jawaban acuan saat pelatihan (unsupervised)</dd>
              </div>
              <div>
                <dt>Mata uang</dt>
                <dd>
                  {model.currency ?? "Belum diketahui"} · nilai mata uang tidak dikonversi
                </dd>
              </div>
              <div>
                <dt>Penjelasan</dt>
                <dd>
                  Perubahan skor saat satu nilai diganti nilai tengah data latih
                </dd>
              </div>
            </>
          )}
          <div>
            <dt>Contoh pelatihan</dt>
            <dd>
              {model.trained_on.profile ?? "—"} · seed{" "}
              {model.trained_on.seed ?? "—"}
            </dd>
          </div>
          <div>
            <dt>Pembuat data / versi indikator</dt>
            <dd>
              {model.trained_on.generator_version ?? "—"} /{" "}
              {model.feature_set_version}
            </dd>
          </div>
          <div>
            <dt>Sidik integritas (hash)</dt>
            <dd className="mono analysis-hash">{model.definition_hash}</dd>
          </div>
        </dl>
      </details>
    </article>
  );
}

/** CF-05: stored flags support investigation; this page offers no disposition. */
export function ModelFlagsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedUnit = searchParams.get("unit");
  const unit: ModelUnit | "" =
    selectedUnit === "AML" || selectedUnit === "FRAUD" ? selectedUnit : "";
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const models = useQuery({ queryKey: ["models"], queryFn: fetchModels });
  const scores = useQuery({
    queryKey: ["model-scores", unit, search, offset],
    queryFn: () =>
      fetchScores({
        unit: unit || undefined,
        search: search || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (searchInput.trim() === search) return;
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  useEffect(() => {
    setOffset(0);
  }, [unit]);

  function selectModel(value: ModelUnit | "") {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("unit", value);
    else next.delete("unit");
    setSearchParams(next, { replace: true });
    setOffset(0);
  }

  const total = scores.data?.total ?? 0;
  const shownOffset = scores.data?.offset ?? offset;
  const unitLabel =
    unit === "AML"
      ? "rangkuman mingguan"
      : unit === "FRAUD"
        ? "transaksi"
        : "hasil pemeriksaan";

  return (
    <div className="analysis-page">
      <div className="page-header">
        <div>
          <span className="page-kicker">HASIL OTOMATIS</span>
          <h1>Kenali hasil yang ditandai</h1>
          <p>Lihat apa yang ditemukan pemeriksaan otomatis, lalu buka antrean tinjauan untuk mencatat keputusan.</p>
        </div>
        <Link to="/alerts" className="btn-link secondary analysis-header-action">
          <Icon name="alert" size={17} /> Buka antrean tinjauan
        </Link>
      </div>

      <div className="analysis-explain-band">
        <span className="analysis-explain-icon"><Icon name="scan" size={25} /></span>
        <div><h2>Ditandai berarti perlu dilihat, bukan sudah terbukti fraud.</h2><p>Hasil muncul ketika skornya mencapai batas pemeriksaan. Buka alasan tiap hasil untuk memahami indikator yang berpengaruh. Skor bukan persentase kemungkinan kejahatan.</p></div>
        <Link to="/guide#istilah" className="btn-link button-secondary">Pahami istilah <Icon name="arrow-right" size={15} /></Link>
      </div>

      {models.error && <div className="card error analysis-query-error" role="alert">
        <h2>Informasi versi belum dapat dimuat</h2>
        <p>{errorMessage(models.error)}</p>
        <p>Hasil pemeriksaan yang berhasil dimuat tetap dapat dibaca di bawah. Muat ulang informasi versi untuk melihat status persetujuannya.</p>
        <button type="button" className="button-secondary" onClick={() => void models.refetch()}>Coba muat versi lagi</button>
      </div>}
      <details className="analysis-model-section analysis-model-disclosure">
        <summary><span><strong>Pemeriksaan yang tersimpan</strong><small>Lihat versi, status persetujuan, dan hasil pengujiannya.</small></span><span className="analysis-small-count">{models.error ? "Versi belum dapat dimuat" : models.data ? `${models.data.length} versi` : "Memuat…"}</span></summary>
      <section
        className="analysis-model-section"
        aria-labelledby="model-versions-heading"
      >
        <div className="section-head">
          <div>
            <h2 id="model-versions-heading">Versi pemeriksaan otomatis</h2>
          </div>
          {models.data && (
            <span className="analysis-small-count">
              {models.data.length} versi tersimpan
            </span>
          )}
        </div>
        {models.isPending && (
          <div className="card analysis-loading" role="status">
            Memuat versi pemeriksaan…
          </div>
        )}
        {models.data && models.data.length === 0 && (
          <div className="card empty-state">
            <Icon name="layers" size={28} />
            <h3>Belum ada versi pemeriksaan</h3>
            <p>
              Analis menyiapkan model, lalu penanggung jawab menyetujuinya sebelum dipakai pada data baru.
            </p>
          </div>
        )}
        {models.data && models.data.length > 0 && (
          <div className="analysis-model-grid">
            {models.data.map((model) => (
              <ModelCard key={model.id} model={model} />
            ))}
          </div>
        )}
      </section>
      </details>

      <section
        className="card analysis-signal-card"
        aria-labelledby="model-signals-heading"
        aria-busy={scores.isFetching}
      >
        <div className="section-head analysis-signal-heading">
          <div>
            <h2 id="model-signals-heading">Hasil yang mencapai batas pemeriksaan</h2>
            <p className="muted">
              Pilih hasil per transaksi atau rangkuman mingguan. Keduanya memiliki satuan berbeda dan tidak boleh dijumlahkan sebagai jumlah transaksi.
            </p>
          </div>
          {scores.data && (
            <span className="analysis-small-count" aria-live="polite">
              {scores.isPlaceholderData
                ? "Memperbarui…"
                : `${total.toLocaleString("id-ID")} ${unitLabel}`}
            </span>
          )}
        </div>

        <div className="analysis-signals-toolbar">
          <div
            className="analysis-tabs"
            role="tablist"
            aria-label="Jenis hasil pemeriksaan"
          >
            {MODEL_TABS.map((tab, index) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                id={`model-tab-${index}`}
                aria-selected={unit === tab.value}
                aria-controls="model-scores-panel"
                tabIndex={unit === tab.value ? 0 : -1}
                className={unit === tab.value ? "analysis-tab-active" : ""}
                onClick={() => selectModel(tab.value)}
                onKeyDown={(event) => {
                  let next = index;
                  if (event.key === "ArrowRight")
                    next = (index + 1) % MODEL_TABS.length;
                  else if (event.key === "ArrowLeft")
                    next = (index + MODEL_TABS.length - 1) % MODEL_TABS.length;
                  else if (event.key === "Home") next = 0;
                  else if (event.key === "End") next = MODEL_TABS.length - 1;
                  else return;
                  event.preventDefault();
                  selectModel(MODEL_TABS[next].value);
                  document.getElementById(`model-tab-${next}`)?.focus();
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <label className="analysis-search-field">
            <span className="analysis-sr-only">Cari hasil berdasarkan nama atau referensi nasabah</span>
            <Icon name="search" size={17} />
            <input
              type="search"
              placeholder="Cari nama atau referensi nasabah"
              maxLength={100}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
        </div>

        <div
          id="model-scores-panel"
          role="tabpanel"
          aria-labelledby={`model-tab-${MODEL_TABS.findIndex((tab) => tab.value === unit)}`}
        >
          {(!scores.data || scores.isPlaceholderData) && <SignalNotice />}
          {(scores.isPending || scores.isPlaceholderData) && (
            <div className="analysis-loading" role="status">
              Memuat hasil pemeriksaan…
            </div>
          )}
          {scores.error && (
            <div className="error analysis-query-error" role="alert">
              <p>{errorMessage(scores.error)}</p>
              <button
                type="button"
                className="button-secondary"
                onClick={() => void scores.refetch()}
              >
                Coba lagi
              </button>
            </div>
          )}
          {scores.data &&
            !scores.isPlaceholderData &&
            (scores.data.items.length === 0 ? (
              <>
                <SignalNotice text={scores.data.signal_notice} />
                <div className="empty-state analysis-empty">
                  <Icon name="activity" size={30} />
                  <h3>
                    {search
                      ? "Hasil belum ditemukan"
                      : "Belum ada hasil pada batas pemeriksaan"}
                  </h3>
                  <p>
                    {search
                      ? "Coba nama atau referensi lain, atau ubah jenis hasil yang dipilih."
                      : "Hasil akan tampil setelah pemeriksaan dijalankan. Daftar kosong tidak membuktikan semua transaksi aman."}
                  </p>
                </div>
              </>
            ) : (
              <ModelSignals
                scores={scores.data.items}
                notice={scores.data.signal_notice}
                showEntity
              />
            ))}
        </div>

        {scores.data && !scores.isPlaceholderData && total > 0 && (
          <div className="analysis-pagination">
            <span className="muted">
              {(shownOffset + 1).toLocaleString("id-ID")}–
              {Math.min(shownOffset + PAGE_SIZE, total).toLocaleString("id-ID")}{" "}
              dari {total.toLocaleString("id-ID")} {unitLabel}
            </span>
            <div>
              <button
                type="button"
                className="button-secondary"
                disabled={offset === 0 || scores.isFetching}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                <Icon name="arrow-left" size={16} /> Sebelumnya
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={offset + PAGE_SIZE >= total || scores.isFetching}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Berikutnya <Icon name="arrow-right" size={16} />
              </button>
            </div>
          </div>
        )}
        <div className="analysis-readonly-note">
          <Icon name="shield" size={17} />
          <span>
            Halaman ini menjelaskan hasil otomatis. Untuk meninjau, menutup, atau meneruskan temuan, gunakan antrean tinjauan.
          </span>
        </div>
      </section>
    </div>
  );
}
