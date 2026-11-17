import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { SignalNotice } from "./Notices";
import { formatObservedDateTime } from "../format";
import { featureDisplayName, featureExplanation, featureValue, scoreNumber } from "../explanations";
import type { ModelScore } from "../types";
import "../review.css";

export { SignalNotice } from "./Notices";

function explanationCaption(method: string | undefined): string {
  if (method === "median_replacement_score_difference")
    return "Setiap indikator dibandingkan dengan nilai tengah data belajar, satu per satu. Kontribusi positif berarti skor asli lebih tinggi daripada skor pembanding. Kontribusi ini tidak bisa dijumlahkan dan bukan bukti sebab-akibat. Metode ini bukan TreeSHAP atau log-odds.";
  if (method === "linear_log_odds")
    return "Model Logistic Regression mengalikan bobot dengan nilai indikator yang sudah diolah. Kontribusi positif menaikkan hasil pada skala log-odds, yaitu skala perhitungan internal, bukan persentase. Jumlah kontribusi ditambah nilai dasar (intercept) membentuk hasil pada skala tersebut.";
  if (method === "tree_shap_log_odds")
    return "TreeSHAP membagi perubahan hasil model ke indikator yang digunakan. Angka kontribusi ditampilkan pada skala log-odds, yaitu skala perhitungan internal, bukan persentase. Nilai positif menaikkan skor; kontribusi bukan bukti sebab-akibat.";
  return "Baca metode penjelasan yang disimpan bersama versi model. Angka kontribusi menjelaskan perhitungan model, bukan persentase risiko atau bukti sebab-akibat.";
}

export function ModelSignals({ scores, notice, showEntity = false }: {
  scores: ModelScore[]; notice: string; showEntity?: boolean;
}) {
  const [visible, setVisible] = useState(3);
  const firstScore = scores[0]?.id;
  useEffect(() => setVisible(3), [firstScore]);
  return (
    <div className="model-signals">
      <p className="review-guidance">Model membaca gabungan indikator, lalu menghasilkan skor. Skor pada atau di atas batas peninjauan dapat memicu temuan. Angka ini bukan peluang terjadinya fraud.</p>
      <SignalNotice text={notice} />
      {scores.length === 0 ? (
        <div className="empty-state review-signal-empty">
          <Icon name="activity" size={28} />
          <h3>Belum ada penilaian otomatis tersimpan</h3>
          <p>Tampilan ini belum memiliki hasil model. Ketiadaan hasil bukan berarti transaksi sudah dinyatakan normal.</p>
        </div>
      ) : (
        <div className="signal-list">
          {scores.slice(0, visible).map((score) => (
            <article className="signal-card" key={score.id} aria-labelledby={`signal-title-${score.id}`}>
              <div className="signal-card-head">
                <div>
                  <span className="eyebrow">{score.unit === "AML" ? "PENILAIAN AKTIVITAS MINGGUAN" : "PENILAIAN TRANSAKSI"}</span>
                  <h3 id={`signal-title-${score.id}`}>{showEntity ? score.customer_name : score.transaction_ref ?? "Aktivitas rekening selama satu minggu"}</h3>
                  <p className="review-cell-sub">{showEntity && <>{score.customer_ref} · </>}{formatObservedDateTime(score.as_of, score.timestamp_precision, score.source_timezone_known)}</p>
                </div>
                <span className={`signal-state ${score.flagged ? "signal-state-flagged" : "signal-state-stored"}`}>
                  <Icon name={score.flagged ? "eye" : "activity"} size={16} />
                  {score.flagged ? "Ditandai oleh model" : "Hasil penilaian tersimpan"}
                </span>
              </div>
              <div className="signal-score-row">
                <div className="signal-score"><span>Skor model</span><strong>{scoreNumber(score.score, score.threshold)}</strong></div>
                <div className="signal-score signal-score-threshold"><span>Batas peninjauan</span><strong>{scoreNumber(score.threshold, score.score)}</strong></div>
                <p>{score.score >= score.threshold ? "Skor memenuhi batas peninjauan." : "Skor berada di bawah batas peninjauan."}<small>Batas dipilih untuk versi model ini. Hasil tetap memerlukan konteks dan penilaian manusia.</small></p>
              </div>
              <div className="signal-observations">
                <h4>Indikator yang digunakan dalam penjelasan</h4>
                <p className="review-caption muted">Berikut beberapa nilai yang diamati model. Masing-masing indikator belum cukup untuk menyimpulkan ada pelanggaran.</p>
                {score.contributions.length === 0 ? <p className="notice">Rincian indikator belum tersedia untuk hasil ini.</p> : (
                  <dl className="signal-observation-list">
                    {score.contributions.slice(0, 3).map((contribution) => (
                      <div key={contribution.feature}>
                        <dt>{featureDisplayName(contribution.feature)}<small>{featureExplanation(contribution.feature)}</small></dt>
                        <dd>{featureValue(contribution, score)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {score.contributions.some((c) => c.feature === "NO_BASELINE" && c.value === 1) && <p className="notice">Riwayat pembanding rekening belum mencukupi. Periksa data tambahan sebelum menarik kesimpulan tentang kebiasaan nasabah.</p>}
              </div>
              <details className="review-technical signal-technical">
                <summary><Icon name="layers" size={17} />Lihat perhitungan dan identitas model</summary>
                <div className="review-technical-body">
                  <dl className="facts review-facts">
                    <dt>Versi model</dt><dd className="mono">{score.model_version}</dd>
                    <dt>Jenis pengamatan</dt><dd>{score.unit === "AML" ? "Aktivitas rekening atau nasabah per minggu" : "Satu transaksi"} <span className="mono">({score.unit})</span></dd>
                    <dt>Arti jenis pengamatan</dt><dd>Kode ini menjelaskan unit yang dinilai, bukan klasifikasi jenis kejahatan.</dd>
                    <dt>Metode penjelasan</dt><dd className="mono">{score.explanation_method ?? "Tidak dicantumkan"}</dd>
                    {score.score_kind && <><dt>Jenis skor</dt><dd className="mono">{score.score_kind}</dd></>}
                    {score.feature_set_version && <><dt>Versi kumpulan indikator</dt><dd className="mono">{score.feature_set_version}</dd></>}
                    {score.currency && <><dt>Mata uang sumber</dt><dd>{score.currency}</dd></>}
                  </dl>
                  <p className="review-caption">{explanationCaption(score.explanation_method)}</p>
                  <div className="table-scroll" tabIndex={0} role="region" aria-label="Nilai dan kontribusi indikator model">
                    <table className="table compact">
                      <thead><tr><th>Indikator</th><th>Definisi asli</th><th className="num">Nilai teramati</th><th className="num">Kontribusi ke perhitungan</th></tr></thead>
                      <tbody>{score.contributions.map((c) => <tr key={c.feature}>
                        <td><strong>{featureDisplayName(c.feature)}</strong><div className="mono review-cell-sub">{c.feature}</div></td>
                        <td className="reason-cell">{c.definition}</td>
                        <td className="num">{featureValue(c, score)}<div className="mono review-cell-sub">{c.value === null ? "Nilai tidak tersedia" : c.value.toLocaleString("id-ID", { maximumFractionDigits: 6 })}</div></td>
                        <td className="num mono">{c.contribution > 0 ? "+" : ""}{c.contribution.toLocaleString("id-ID", { maximumFractionDigits: 6 })}<div className="review-cell-sub">{c.contribution > 0 ? "Hasil lebih tinggi" : c.contribution < 0 ? "Hasil lebih rendah" : "Tidak ada perubahan"} pada perhitungan ini</div></td>
                      </tr>)}</tbody>
                    </table>
                  </div>
                </div>
              </details>
            </article>
          ))}
          {visible < scores.length && <button type="button" className="button-secondary signal-show-more" onClick={() => setVisible((count) => count + 10)}>Lihat hasil berikutnya · {scores.length - visible} belum ditampilkan<Icon name="arrow-right" size={17} /></button>}
        </div>
      )}
    </div>
  );
}
