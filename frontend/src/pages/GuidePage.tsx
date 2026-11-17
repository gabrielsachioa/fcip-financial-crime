import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Icon } from "../components/Icon";
import "../guide.css";

const terms = [
  { name: "Temuan untuk ditinjau", technical: "Alert", meaning: "Catatan yang meminta peninjauan manusia setelah suatu aturan pemeriksaan atau model yang diizinkan menghasilkan temuan. Catatan ini belum menyimpulkan adanya fraud atau pencucian uang.", example: "Buka Perlu ditinjau, baca alasannya, lalu periksa transaksi dan konteksnya." },
  { name: "Ditandai oleh model", technical: "Flag", meaning: "Hasil model yang mencapai atau melewati batas skor. Hasil ini dapat tersimpan meskipun pembuatan alert model belum diaktifkan, sehingga tidak selalu menjadi temuan di antrean tinjauan.", example: "Lihat Hasil otomatis untuk hasil model dan Perlu ditinjau untuk catatan yang sudah menjadi alert." },
  { name: "Temuan yang dapat dijelaskan", technical: "False positive", meaning: "Aktivitas yang ditandai sistem tetapi dinilai tidak perlu diteruskan berdasarkan label acuan atau hasil tinjauan manusia.", example: "Simpan alasan penilaian Anda agar temuan dapat ditelusuri kembali." },
  { name: "Pola pemeriksaan", technical: "Rule", meaning: "Kondisi yang digunakan sistem untuk mencari aktivitas tertentu, misalnya transaksi berulang dalam suatu rentang waktu.", example: "Satu nasabah dapat memiliki beberapa temuan dari pola yang berbeda." },
  { name: "Skor model", technical: "Model score", meaning: "Angka yang dihasilkan model untuk membandingkan aktivitas dengan batas pemeriksaan. Skor ini belum dikalibrasi sebagai peluang terjadinya fraud.", example: "Baca skor bersama batasnya. Skor tinggi saja tidak membuktikan kejahatan." },
  { name: "Batas pemeriksaan", technical: "Threshold", meaning: "Nilai pembanding untuk menentukan apakah skor meminta peninjauan. Pada model yang disetujui, skor yang mencapai atau melewati batas dapat menghasilkan temuan jika fitur alert model diaktifkan.", example: "Skor di bawah batas berarti tidak ditandai oleh model tersebut, bukan jaminan transaksi aman." },
  { name: "Model", technical: "Machine learning / ML", meaning: "Cara perhitungan yang mempelajari pola dari data contoh. Hasilnya bergantung pada kualitas contoh, informasi yang tersedia, dan cara pengujian.", example: "Model harus ditinjau dan disetujui sebelum dipakai untuk pemeriksaan data baru." },
  { name: "Faktor penyumbang skor", technical: "Feature contribution / SHAP", meaning: "Informasi yang membantu menjelaskan perhitungan skor, seperti jumlah transaksi sebelumnya atau penggunaan perangkat. Arah dan besar kontribusi mengikuti metode penjelasan model.", example: "Faktor penyumbang bukan penyebab kejahatan. Periksa juga informasi yang belum tersedia." },
  { name: "Riwayat pembanding", technical: "Baseline", meaning: "Aktivitas rekening sebelumnya yang digunakan sebagai pembanding. Jika riwayat belum cukup, sebagian perbandingan tidak dapat dihitung.", example: "Rekening yang baru muncul di data belum tentu benar-benar rekening baru." },
  { name: "Ketepatan temuan", technical: "Precision", meaning: "Dari semua contoh yang ditandai model, bagian yang sesuai dengan label positif acuan. Maknanya mengikuti definisi label pada data contoh.", example: "Nilai pada data simulasi tidak membuktikan ketepatan model pada transaksi bank nyata." },
  { name: "Cakupan contoh positif", technical: "Recall", meaning: "Dari seluruh contoh berlabel positif, bagian yang berhasil ditandai model. Contoh positif yang tidak ditandai disebut terlewat.", example: "Ketepatan dan cakupan perlu dilihat bersama agar jumlah temuan tetap dapat ditinjau." },
  { name: "Data latihan dan validasi", technical: "TRAIN / validation", meaning: "Data latihan digunakan untuk mempelajari pola. Data validasi digunakan untuk membandingkan model dan memilih batas sebelum hasil uji akhir dibuka.", example: "Label jawaban, catatan reviewer, dan kategori pola tidak boleh menjadi bocoran jawaban di masukan model." },
  { name: "Hasil uji akhir", technical: "Final TEST", meaning: "Pengukuran setelah satu pilihan model dan batas ditetapkan. Setelah hasil dibuka, data tersebut tidak dapat dianggap sebagai pengujian baru yang belum pernah dilihat.", example: "Pilihan model dan batas dikunci untuk menjaga kejujuran evaluasi." },
  { name: "Data perlu diperbaiki", technical: "Quarantine / karantina", meaning: "Baris data yang belum dapat dipakai karena masalah seperti tanggal tidak valid atau ID ganda. Ini adalah masalah kualitas data, bukan tanda fraud.", example: "Lihat alasan penolakan dan perbaiki sumber datanya." },
  { name: "Satu unggahan data", technical: "Batch", meaning: "Sekumpulan baris transaksi dari satu proses unggah. Catatannya menunjukkan file asal, jumlah baris diterima, dan baris yang perlu diperbaiki.", example: "Unggahan yang selesai diproses masih dapat memiliki baris yang perlu diperbaiki." },
  { name: "Format file transaksi", technical: "CSV / Parquet", meaning: "CSV menyimpan tabel sebagai teks. Parquet menyimpan tabel dalam format khusus yang lebih ringkas. UTF-8 adalah cara penulisan teks yang digunakan file CSV.", example: "Format file tidak menentukan apakah isi transaksi normal atau mencurigakan." },
  { name: "ID rangkaian aktivitas", technical: "Correlation ID", meaning: "Identitas teknis untuk menelusuri beberapa catatan aktivitas yang berasal dari proses yang sama. Gunakan jika ingin melihat jejak suatu temuan.", example: "Buka tautan riwayat pada detail temuan; Anda tidak perlu menghafal ID ini." },
  { name: "Peran peninjau", technical: "Triage Analyst", meaning: "Petugas yang meninjau temuan awal dan mencatat apakah perlu diteruskan. Peran lain dapat memiliki tugas berbeda, seperti mengunggah data, memeriksa kasus, atau menyetujui model.", example: "Jika tombol keputusan tidak tersedia, lihat keterangan hak akses atau hubungi pengelola." },
  { name: "Pemeriksaan lanjutan", technical: "Case / investigasi", meaning: "Catatan pemeriksaan yang menghubungkan temuan dengan penanganan oleh petugas. Meneruskan temuan berarti memerlukan pemeriksaan tambahan.", example: "Status diteruskan tidak berarti fraud telah terbukti." },
  { name: "Persetujuan orang kedua", technical: "Maker–checker", meaning: "Pengusul dan pemberi persetujuan adalah dua pengguna berbeda. Pemisahan ini digunakan pada proses yang memerlukan pemeriksaan kedua.", example: "Pengusul model tidak dapat menyetujui modelnya sendiri." },
  { name: "Fraud dan pencucian uang", technical: "Fraud / AML", meaning: "Fraud berkaitan dengan tindakan curang. AML adalah upaya mengenali dan menangani dugaan pencucian uang. Dalam aplikasi, label unit FRAUD/AML juga menunjukkan bentuk pengamatan model, bukan vonis jenis kejahatan.", example: "Pola tidak biasa dapat memiliki penjelasan yang sah; kesimpulan memerlukan penilaian manusia." },
];

export function GuidePage() {
  const [search, setSearch] = useState("");
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("id-ID");
    return terms.filter((term) => `${term.name} ${term.technical} ${term.meaning}`.toLocaleLowerCase("id-ID").includes(query));
  }, [search]);

  return <>
    <div className="page-header"><div><span className="eyebrow">PANDUAN PENGGUNAAN</span><h1>Mulai dari yang sederhana.</h1><p className="page-subtitle">Kenali alurnya, pahami istilahnya, lalu tinjau dengan konteks yang cukup.</p></div><Link to="/" className="btn-link secondary"><Icon name="arrow-left" size={16} />Kembali ke beranda</Link></div>
    <section className="guide-intro" id="meninjau" aria-labelledby="guide-flow-title">
      <div className="guide-intro-heading"><span className="guide-icon"><Icon name="layers" size={25} /></span><div><h2 id="guide-flow-title">Tiga langkah untuk meninjau transaksi</h2><p>Mulai dari langkah yang sesuai dengan tugas Anda. Tindakan yang tersedia mengikuti hak akses akun.</p></div></div>
      <ol className="guide-steps">
        <li><span className="guide-step-number">01</span><h3>Tambahkan data</h3><p>Di Beranda, unggah transaksi dan lihat baris mana yang berhasil dibaca. Setelah itu jalankan pemeriksaan.</p><Link to="/">Buka beranda <Icon name="arrow-right" size={16} /></Link></li>
        <li><span className="guide-step-number">02</span><h3>Pahami temuan</h3><p>Buka Perlu ditinjau. Setiap temuan menjelaskan pola yang terdeteksi dan transaksi yang mendukungnya.</p><Link to="/alerts">Lihat yang perlu ditinjau <Icon name="arrow-right" size={16} /></Link></li>
        <li><span className="guide-step-number">03</span><h3>Catat penilaian</h3><p>Periksa konteksnya. Jika memiliki izin, catat alasan penutupan atau teruskan untuk pemeriksaan lanjutan.</p><Link to="/alerts">Mulai meninjau <Icon name="arrow-right" size={16} /></Link></li>
      </ol>
    </section>
    <div className="guide-context-grid">
      <section className="card guide-context"><span className="guide-context-icon"><Icon name="eye" size={22} /></span><h2>Ditandai bukan berarti terbukti.</h2><p>Sistem menemukan pola atau skor yang layak diperiksa. Aktivitas yang sah juga dapat menghasilkan pola serupa. Baca bukti, riwayat, dan konteks sebelum menentukan tindak lanjut.</p></section>
      <section className="card guide-context"><span className="guide-context-icon"><Icon name="scan" size={22} /></span><h2>Mengelola pemeriksaan otomatis?</h2><p>Halaman Atur deteksi menuntun pengelola menyiapkan contoh, membandingkan model, dan mengajukan persetujuan. Anda tidak perlu melatih model untuk membaca temuan yang sudah ada.</p><Link to="/lab">Buka pengaturan deteksi <Icon name="arrow-right" size={16} /></Link></section>
    </div>
    <section className="card" id="istilah" aria-labelledby="guide-terms-title">
      <div className="section-head"><div><span className="section-kicker">KAMUS SINGKAT</span><h2 id="guide-terms-title">Istilah teknis, bahasa sederhana.</h2><p>Penjelasan yang sama dapat Anda gunakan saat membaca hasil pemeriksaan.</p></div><label className="guide-search"><span>Cari istilah</span><div><Icon name="search" size={17} /><input type="search" placeholder="Misalnya skor, flag, atau recall" value={search} onChange={(event) => setSearch(event.target.value)} /></div></label></div>
      <p className="guide-search-count" role="status">{visible.length} istilah {search.trim() ? "sesuai pencarian" : "tersedia"}</p>
      {visible.length ? <div className="guide-terms">{visible.map((term) => <article className="guide-term" key={term.name}><h3>{term.name}</h3><span className="guide-technical-name">{term.technical}</span><p>{term.meaning}</p><p className="guide-term-tip"><Icon name="info" size={15} /><span>{term.example}</span></p></article>)}</div> : <div className="empty-state"><Icon name="search" /><h3>Istilah belum ditemukan</h3><p>Coba kata yang lebih singkat atau lihat seluruh istilah.</p><button type="button" className="button-secondary" onClick={() => setSearch("")}>Tampilkan semua istilah</button></div>}
    </section>
  </>;
}
