import { formatAmount } from "./format";
import type { AlertDetail, Contribution, ModelScore } from "./types";

type FeatureHelp = { name: string; explanation: string; kind?: "money" | "count" | "days" | "ratio" | "share" | "flag" };

// Presentation only. Names and units follow behavioral_v1/fs_v2 and never
// change the feature values, scores, thresholds or reference labels.
const FEATURES: Record<string, FeatureHelp> = {
  AMOUNT: { name: "Nominal transaksi", explanation: "Jumlah uang pada transaksi ini, dalam mata uang sumber.", kind: "money" },
  LOG_AMOUNT: { name: "Nominal pada skala model", explanation: "Nominal yang diubah ke skala matematika agar dapat diolah model. Angka ini bukan jumlah uang atau persentase risiko." },
  AMOUNT_OVER_TRAIN_MEDIAN: { name: "Nominal dibanding data belajar", explanation: "Perbandingan nominal dengan nilai tengah transaksi pada data yang dipakai melatih model.", kind: "ratio" },
  AMOUNT_OVER_PRIOR_MEAN: { name: "Nominal dibanding riwayat rekening", explanation: "Perbandingan nominal dengan rata-rata transaksi rekening dalam 90 hari sebelumnya. Memerlukan riwayat yang cukup.", kind: "ratio" },
  AMOUNT_Z_PRIOR: { name: "Perbedaan nominal dari kebiasaan", explanation: "Ukuran seberapa jauh nominal dari rata-rata riwayat rekening, setelah mempertimbangkan variasi riwayatnya. Bukan persentase." },
  AMOUNT_OVER_OWN_P95: { name: "Nominal dibanding transaksi besar sebelumnya", explanation: "Perbandingan nominal dengan batas yang mencakup 95% nominal dalam riwayat nasabah sebelumnya.", kind: "ratio" },
  AMOUNT_OVER_OWN_MEDIAN: { name: "Nominal dibanding nilai tengah riwayat", explanation: "Perbandingan nominal dengan nilai tengah transaksi nasabah sebelumnya.", kind: "ratio" },
  AMOUNT_OVER_P95_LAST_N: { name: "Nominal dibanding transaksi terakhir", explanation: "Perbandingan nominal dengan batas 95% dari kelompok transaksi sebelumnya yang dipakai model.", kind: "ratio" },
  IS_DEBIT: { name: "Arah dana", explanation: "Menunjukkan apakah dana keluar dari rekening atau masuk ke rekening.", kind: "flag" },
  IS_OUTBOUND: { name: "Arah dana", explanation: "Menunjukkan apakah dana keluar dari rekening atau masuk ke rekening.", kind: "flag" },
  HISTORY_DAYS: { name: "Panjang riwayat yang tersedia", explanation: "Waktu sejak transaksi pertama yang tercatat. Ini bukan usia pembukaan rekening.", kind: "days" },
  PRIOR_HISTORY_COUNT: { name: "Transaksi sebelumnya yang tersedia", explanation: "Jumlah transaksi yang sudah tersedia sebelum transaksi ini dinilai.", kind: "count" },
  HISTORY_TXN_COUNT: { name: "Transaksi dalam riwayat", explanation: "Jumlah transaksi yang sudah tercatat sampai waktu penilaian.", kind: "count" },
  PRIOR_TXN_COUNT_90D: { name: "Transaksi sebelumnya dalam 90 hari", explanation: "Jumlah transaksi yang tersedia pada 90 hari sebelum penilaian.", kind: "count" },
  BASELINE_TXN_COUNT: { name: "Transaksi sebagai pembanding", explanation: "Jumlah transaksi dalam riwayat 90 hari yang digunakan sebagai pembanding.", kind: "count" },
  NO_BASELINE: { name: "Kecukupan riwayat rekening", explanation: "Perbandingan dengan kebiasaan rekening memerlukan riwayat yang cukup. Informasi tambahan membantu peninjauan saat riwayat belum memadai.", kind: "flag" },
  PRIOR_COUNT_R7D: { name: "Transaksi sebelumnya dalam 7 hari", explanation: "Jumlah transaksi pada tujuh hari sebelumnya, tanpa transaksi yang sedang dinilai.", kind: "count" },
  PRIOR_COUNT_R30D: { name: "Transaksi sebelumnya dalam 30 hari", explanation: "Jumlah transaksi pada 30 hari sebelumnya.", kind: "count" },
  PRIOR_VALUE_R7D: { name: "Total nominal 7 hari sebelumnya", explanation: "Jumlah nominal transaksi tujuh hari sebelumnya, tanpa konversi mata uang.", kind: "money" },
  PRIOR_VALUE_R30D: { name: "Total nominal 30 hari sebelumnya", explanation: "Jumlah nominal transaksi 30 hari sebelumnya, tanpa konversi mata uang.", kind: "money" },
  PRIOR_DEBIT_VALUE_R7D: { name: "Dana keluar 7 hari sebelumnya", explanation: "Jumlah nominal dana keluar pada tujuh hari sebelumnya.", kind: "money" },
  PRIOR_SMALL_COUNT_R7D: { name: "Transaksi nominal kecil sebelumnya", explanation: "Jumlah transaksi tujuh hari sebelumnya dalam kategori nominal kecil. Batas kategori ditentukan dari contoh pelatihan, bukan batas pelaporan.", kind: "count" },
  DAYS_SINCE_PREV_OBSERVATION: { name: "Jeda dari transaksi sebelumnya", explanation: "Jarak waktu dari transaksi sebelumnya yang tersedia dalam data.", kind: "days" },
  DAYS_SINCE_PREV_TXN: { name: "Jeda aktivitas nasabah", explanation: "Jarak waktu sejak transaksi nasabah sebelumnya yang tercatat.", kind: "days" },
  DAYS_SINCE_PREV_TXN_ACCOUNT: { name: "Jeda aktivitas rekening", explanation: "Jarak waktu sejak transaksi pada rekening ini sebelumnya.", kind: "days" },
  COUNT_R1H: { name: "Transaksi dalam 1 jam", explanation: "Jumlah transaksi dalam satu jam, termasuk transaksi ini. Memerlukan waktu transaksi yang cukup rinci.", kind: "count" },
  COUNT_R5M: { name: "Transaksi dalam 5 menit", explanation: "Jumlah transaksi lima menit terakhir, termasuk transaksi ini. Transaksi lain dengan waktu persis sama tidak dianggap terjadi lebih dahulu.", kind: "count" },
  VALUE_R1H: { name: "Total nominal dalam 1 jam", explanation: "Jumlah nominal yang tercatat dalam satu jam, termasuk transaksi ini. Dana masuk dan keluar dijumlahkan sebagai aktivitas, bukan saldo.", kind: "money" },
  KNOWN_CHANNELS_R24H: { name: "Kanal berbeda yang tercatat", explanation: "Jumlah kanal berbeda dalam 24 jam. Kanal yang tidak diketahui tidak dihitung; banyak kanal belum membuktikan penyamaran dana.", kind: "count" },
  KNOWN_COUNTERPARTIES_R24H: { name: "Lawan transaksi berbeda yang tercatat", explanation: "Jumlah ID lawan transaksi berbeda dalam 24 jam. Jika ada ID yang hilang, jumlah sebenarnya belum diketahui sepenuhnya.", kind: "count" },
  COUNTERPARTY_COVERAGE_R24H: { name: "Kelengkapan ID lawan transaksi", explanation: "Bagian transaksi dalam 24 jam yang memiliki ID lawan transaksi. Ini ukuran kelengkapan data, bukan persentase risiko.", kind: "share" },
  OBSERVED_SAME_COUNTERPARTY_COUNT_R1H: { name: "Transaksi sebelumnya dengan pihak yang sama", explanation: "Jumlah transaksi satu jam sebelumnya dengan ID lawan transaksi yang sama. Menggunakan hubungan yang tercatat tanpa menyimpulkan kepemilikan rekening.", kind: "count" },
  AMOUNT_OVER_PRIOR_COUNTERPARTY_MIN_R1H: { name: "Lonjakan nominal dengan pihak yang sama", explanation: "Nominal transaksi ini dibanding transaksi terkecil sebelumnya dengan pihak yang sama dalam satu jam. Lonjakan belum membuktikan transaksi uji coba.", kind: "ratio" },
  CREDIT_VALUE_R4H: { name: "Dana masuk dalam 4 jam", explanation: "Total dana masuk yang tercatat selama empat jam, termasuk transaksi ini jika masuk.", kind: "money" },
  DEBIT_VALUE_R4H: { name: "Dana keluar dalam 4 jam", explanation: "Total dana keluar yang tercatat selama empat jam, termasuk transaksi ini jika keluar.", kind: "money" },
  OUT_IN_VALUE_RATIO_R4H: { name: "Perbandingan dana keluar dengan dana masuk", explanation: "Dana keluar dibagi dana masuk dalam empat jam. Bisa melebihi satu dan belum membuktikan uang yang sama diteruskan; tanpa dana masuk nilainya belum diketahui.", kind: "ratio" },
  SECONDS_SINCE_PRIOR_CREDIT: { name: "Jeda sejak dana masuk sebelumnya (detik)", explanation: "Jarak waktu dari dana masuk sebelumnya yang tercatat. Ini belum mencocokkan asal dana yang dipakai pada transaksi ini." },
  COUNT_R24H: { name: "Transaksi dalam 24 jam", explanation: "Jumlah transaksi dalam 24 jam, termasuk transaksi ini.", kind: "count" },
  DEBIT_VALUE_R24H: { name: "Dana keluar dalam 24 jam", explanation: "Total dana keluar dalam 24 jam, termasuk transaksi ini jika dananya keluar.", kind: "money" },
  OUT_SUM_R1H: { name: "Dana keluar dalam 1 jam", explanation: "Total nominal dana keluar dalam satu jam.", kind: "money" },
  OUT_SUM_R24H: { name: "Dana keluar dalam 24 jam", explanation: "Total nominal dana keluar dalam 24 jam.", kind: "money" },
  COUNT_R24H_OVER_DAILY_BASELINE: { name: "Frekuensi dibanding kebiasaan harian", explanation: "Perbandingan jumlah transaksi 24 jam dengan rata-rata harian sebelumnya; rumus model menambahkan satu pada kedua jumlah.", kind: "ratio" },
  OUT_SUM_R24H_OVER_OWN_P95: { name: "Dana keluar dibanding riwayat nominal", explanation: "Perbandingan dana keluar 24 jam dengan batas nominal yang mencakup 95% riwayat sebelumnya.", kind: "ratio" },
  OUT_SUM_R24H_OVER_P95_LAST_N: { name: "Dana keluar dibanding transaksi terakhir", explanation: "Perbandingan dana keluar 24 jam dengan batas nominal pada kelompok transaksi sebelumnya.", kind: "ratio" },
  CHANNEL_TRAIN_FREQUENCY: { name: "Seberapa umum kanal ini dalam data belajar", explanation: "Bagian transaksi data belajar yang memakai kanal ini. Kanal yang jarang tidak otomatis berarti fraud.", kind: "share" },
  CHANNEL_UNSEEN: { name: "Kanal dikenal oleh model", explanation: "Menunjukkan apakah kanal pernah ada pada contoh belajar model. Kanal yang belum dikenal tidak otomatis bermasalah.", kind: "flag" },
  CHANNEL_CODE: { name: "Kode kanal transaksi", explanation: "Nomor kategori kanal yang digunakan model. Nomor yang lebih besar tidak berarti lebih berisiko." },
  TXN_TYPE_CODE: { name: "Kode jenis transaksi", explanation: "Nomor kategori jenis transaksi. Ini bukan urutan tingkat risiko." },
  LOGIN_ATTEMPTS: { name: "Percobaan masuk yang tercatat", explanation: "Jumlah percobaan masuk yang dicatat sumber untuk transaksi ini; tidak otomatis berarti semuanya gagal.", kind: "count" },
  TRANSACTION_DURATION: { name: "Durasi yang dicatat sumber", explanation: "Nilai durasi dari sumber data. Satuannya tidak disimpulkan oleh aplikasi." },
  ACCOUNT_BALANCE: { name: "Saldo yang tercatat", explanation: "Saldo dari sumber data; belum tentu saldo sebelum atau sesudah transaksi.", kind: "money" },
  BALANCE_OVER_PRIOR_MEAN: { name: "Saldo dibanding riwayat", explanation: "Perbandingan saldo tercatat dengan rata-rata saldo sebelumnya. Tidak tersedia jika pembanding belum memadai.", kind: "ratio" },
  DAY_ONLY_TIMESTAMP: { name: "Kelengkapan waktu transaksi", explanation: "Jika sumber hanya memuat tanggal, urutan transaksi dalam hari tersebut belum diketahui.", kind: "flag" },
  UTC_HOUR_SIN: { name: "Pola jam transaksi", explanation: "Representasi matematika jam UTC untuk model. Nilainya bukan jam, persentase atau bukti transaksi malam hari." },
  UTC_HOUR_COS: { name: "Pola jam transaksi", explanation: "Representasi matematika jam UTC untuk model. Baca waktu transaksi asli untuk mengetahui jamnya." },
  LOCAL_HOUR: { name: "Jam transaksi", explanation: "Jam transaksi dalam zona waktu Asia/Jakarta pada model ini." },
  DEVICE_PRESENT: { name: "Ketersediaan data perangkat", explanation: "Apakah sumber menyertakan referensi perangkat.", kind: "flag" },
  IP_PRESENT: { name: "Ketersediaan alamat jaringan", explanation: "Apakah sumber menyertakan alamat IP. Alamat ini tidak otomatis menjelaskan lokasi pengguna.", kind: "flag" },
  LOCATION_PRESENT: { name: "Ketersediaan data lokasi", explanation: "Apakah sumber menyertakan keterangan lokasi.", kind: "flag" },
  DEVICE_FIRST_USE: { name: "Perangkat pada riwayat rekening", explanation: "Apakah perangkat ini belum terlihat pada riwayat yang tersedia. Memerlukan data perangkat dan riwayat yang cukup.", kind: "flag" },
  IP_FIRST_USE: { name: "Alamat jaringan pada riwayat rekening", explanation: "Apakah alamat IP ini belum terlihat pada riwayat yang tersedia. Ini tidak membuktikan perpindahan lokasi.", kind: "flag" },
  LOCATION_FIRST_USE: { name: "Lokasi pada riwayat rekening", explanation: "Apakah keterangan lokasi dari sumber belum terlihat sebelumnya; bukan kesimpulan tentang perjalanan pengguna.", kind: "flag" },
  MERCHANT_FIRST_USE: { name: "Merchant pada riwayat pembayaran", explanation: "Apakah identitas merchant belum terlihat pada riwayat yang tersedia. Merchant adalah pihak usaha penerima pembayaran.", kind: "flag" },
  COUNTERPARTY_FIRST_USE: { name: "Pihak transaksi pada riwayat", explanation: "Apakah rekening atau pihak lawan transaksi belum terlihat dalam riwayat yang tersedia.", kind: "flag" },
  DEVICE_TENURE_DAYS: { name: "Lama perangkat terlihat dalam riwayat", explanation: "Waktu sejak perangkat pertama terlihat pada riwayat nasabah.", kind: "days" },
  DEVICE_IS_EMULATOR: { name: "Penanda perangkat virtual", explanation: "Penanda perangkat virtual dari data perangkat; tidak otomatis berarti penyalahgunaan.", kind: "flag" },
  DEVICE_IS_ROOTED: { name: "Penanda perubahan sistem perangkat", explanation: "Penanda bahwa akses sistem perangkat telah diubah menurut data perangkat.", kind: "flag" },
  COUNTERPARTY_COUNTRY_LISTED: { name: "Negara pada daftar pemantauan", explanation: "Apakah negara pihak lawan transaksi ada dalam daftar yang dikonfigurasi organisasi; bukan konfirmasi kejahatan.", kind: "flag" },
  NEW_COUNTERPARTIES_R24H: { name: "Pihak transaksi baru dalam 24 jam", explanation: "Jumlah pihak transaksi yang belum terlihat sebelumnya dalam riwayat tersedia.", kind: "count" },
  DISTINCT_DEVICES_R24H: { name: "Perangkat berbeda dalam 24 jam", explanation: "Jumlah referensi perangkat berbeda yang tercatat dalam 24 jam.", kind: "count" },
  TXN_COUNT_W: { name: "Transaksi selama minggu penilaian", explanation: "Jumlah transaksi rekening dalam minggu kalender yang dinilai.", kind: "count" },
  TXN_VALUE_W: { name: "Total nominal minggu penilaian", explanation: "Jumlah nominal transaksi pada minggu penilaian dalam mata uang sumber.", kind: "money" },
  DEBIT_VALUE_W: { name: "Dana keluar minggu penilaian", explanation: "Total nominal dana keluar selama minggu yang dinilai.", kind: "money" },
  CREDIT_VALUE_W: { name: "Dana masuk minggu penilaian", explanation: "Total nominal dana masuk selama minggu yang dinilai.", kind: "money" },
  NET_INFLOW_W: { name: "Selisih dana masuk dan keluar", explanation: "Dana masuk dikurangi dana keluar pada minggu penilaian; bukan saldo rekening.", kind: "money" },
  DEBIT_SHARE_W: { name: "Bagian nominal yang keluar", explanation: "Perbandingan dana keluar dengan total nominal transaksi selama minggu penilaian.", kind: "share" },
  AMOUNT_MEAN_W: { name: "Rata-rata nominal mingguan", explanation: "Rata-rata nominal transaksi selama minggu yang dinilai.", kind: "money" },
  AMOUNT_MAX_W: { name: "Transaksi terbesar pada minggu penilaian", explanation: "Nominal transaksi terbesar selama minggu yang dinilai.", kind: "money" },
  SMALL_AMOUNT_SHARE_W: { name: "Bagian transaksi nominal kecil", explanation: "Bagian transaksi mingguan di bawah batas nominal kecil dari data belajar. Ini bukan batas pelaporan.", kind: "share" },
  COUNT_OVER_PRIOR_WEEKLY_MEAN: { name: "Frekuensi mingguan dibanding riwayat", explanation: "Perbandingan jumlah transaksi minggu ini dengan pembanding dari 30 hari sebelumnya yang disetarakan menjadi satu minggu.", kind: "ratio" },
  VALUE_OVER_PRIOR_WEEKLY_MEAN: { name: "Nominal mingguan dibanding riwayat", explanation: "Perbandingan nominal minggu ini dengan pembanding dari 30 hari sebelumnya yang disetarakan menjadi satu minggu.", kind: "ratio" },
  LOGIN_ATTEMPTS_MEAN_W: { name: "Rata-rata percobaan masuk", explanation: "Rata-rata jumlah percobaan masuk yang tercatat pada minggu penilaian." },
  LOGIN_ATTEMPTS_MAX_W: { name: "Percobaan masuk terbanyak", explanation: "Jumlah percobaan masuk terbesar yang dicatat sumber pada minggu penilaian.", kind: "count" },
  DURATION_MEAN_W: { name: "Rata-rata durasi tercatat", explanation: "Rata-rata durasi menurut sumber. Satuannya belum ditafsirkan oleh aplikasi." },
  DURATION_MAX_W: { name: "Durasi tercatat terpanjang", explanation: "Nilai durasi terbesar dari sumber. Satuannya belum ditafsirkan oleh aplikasi." },
  BALANCE_MEAN_W: { name: "Rata-rata saldo tercatat", explanation: "Rata-rata cuplikan saldo yang diberikan sumber, bukan rekonstruksi saldo berjalan.", kind: "money" },
  DISTINCT_DEVICES_W: { name: "Perangkat berbeda dalam seminggu", explanation: "Jumlah referensi perangkat berbeda yang diberikan sumber.", kind: "count" },
  DISTINCT_IPS_W: { name: "Alamat jaringan berbeda dalam seminggu", explanation: "Jumlah alamat IP berbeda. Angka ini tidak menjelaskan jumlah lokasi atau orang.", kind: "count" },
  DISTINCT_LOCATIONS_W: { name: "Lokasi berbeda dalam seminggu", explanation: "Jumlah keterangan lokasi berbeda yang diberikan sumber.", kind: "count" },
  DEVICE_NEW_SHARE_W: { name: "Bagian perangkat yang belum terlihat", explanation: "Bagian pengamatan perangkat minggu ini yang belum ada sebelum minggu penilaian.", kind: "share" },
  IP_NEW_SHARE_W: { name: "Bagian alamat jaringan yang belum terlihat", explanation: "Bagian alamat IP yang belum terlihat sebelum minggu penilaian.", kind: "share" },
  LOCATION_NEW_SHARE_W: { name: "Bagian lokasi yang belum terlihat", explanation: "Bagian keterangan lokasi yang belum terlihat sebelum minggu penilaian.", kind: "share" },
  DAY_ONLY_SHARE_W: { name: "Bagian transaksi tanpa jam rinci", explanation: "Bagian transaksi mingguan yang hanya memiliki tanggal pada sumber.", kind: "share" },
  BASELINE_DAYS_AVAILABLE: { name: "Hari riwayat sebagai pembanding", explanation: "Jumlah hari riwayat yang tersedia untuk perbandingan model.", kind: "days" },
  ACCOUNT_AGE_DAYS: { name: "Usia rekening yang tercatat", explanation: "Waktu sejak tanggal pembukaan rekening menurut data master.", kind: "days" },
  ENTITY_IS_BUSINESS: { name: "Jenis nasabah", explanation: "Penanda nasabah usaha pada data master; bukan tingkat risiko.", kind: "flag" },
};

const LEGACY: Record<string, FeatureHelp> = {
  TXN_COUNT_R7D: { name: "Transaksi dalam 7 hari", explanation: "Jumlah transaksi pada periode tujuh hari penilaian.", kind: "count" },
  TXN_COUNT_R30D: { name: "Transaksi dalam 30 hari", explanation: "Jumlah transaksi pada periode 30 hari penilaian.", kind: "count" },
  TXN_COUNT_R90D: { name: "Transaksi dalam 90 hari", explanation: "Jumlah transaksi pada periode 90 hari penilaian.", kind: "count" },
  P02_BAND_COUNT_R7D: { name: "Transaksi mendekati batas nominal", explanation: "Jumlah transaksi dalam rentang nominal yang dipantau selama tujuh hari.", kind: "count" },
  P02_BAND_COUNT_ROLLING_7D: { name: "Kelompok transaksi mendekati batas", explanation: "Jumlah terbesar transaksi dalam rentang nominal yang dipantau pada jendela tujuh hari.", kind: "count" },
  DISTINCT_ACCOUNTS_R7D: { name: "Rekening sendiri yang digunakan", explanation: "Jumlah rekening nasabah yang digunakan selama tujuh hari penilaian.", kind: "count" },
  MAX_DAILY_COUNT_R7D: { name: "Transaksi terbanyak dalam sehari", explanation: "Jumlah transaksi harian terbesar dalam tujuh hari penilaian.", kind: "count" },
  MAX_COUNT_ROLLING_24H: { name: "Transaksi terbanyak dalam 24 jam", explanation: "Jumlah transaksi terbesar pada jendela 24 jam selama periode penilaian.", kind: "count" },
  LONGEST_GAP_DAYS_R7D: { name: "Jeda aktivitas nasabah terpanjang", explanation: "Jeda terpanjang sebelum salah satu transaksi minggu penilaian.", kind: "days" },
  LONGEST_ACCOUNT_GAP_DAYS_R7D: { name: "Jeda aktivitas rekening terpanjang", explanation: "Jeda terpanjang pada rekening sebelum transaksi minggu penilaian.", kind: "days" },
  DEVICE_ENTITY_COUNT_R30D: { name: "Nasabah yang memakai perangkat sama", explanation: "Jumlah nasabah berbeda yang terhubung dengan perangkat yang sama dalam 30 hari.", kind: "count" },
  DEVICE_ACCOUNT_COUNT_R30D: { name: "Rekening yang memakai perangkat sama", explanation: "Jumlah rekening berbeda yang terhubung dengan perangkat yang sama dalam 30 hari.", kind: "count" },
  ROUND_SHARE_R30D: { name: "Bagian transaksi bernominal bulat", explanation: "Bagian transaksi yang memenuhi kelipatan nominal pada konfigurasi fitur.", kind: "share" },
  WEEK_VALUE_OVER_BASELINE: { name: "Nominal mingguan dibanding riwayat", explanation: "Perbandingan nominal minggu penilaian dengan rata-rata minggu sebelumnya.", kind: "ratio" },
  WEEK_VALUE_INCREASE: { name: "Kenaikan nominal mingguan", explanation: "Selisih nominal minggu ini dari rata-rata mingguan sebelumnya.", kind: "money" },
  GEO_EXPOSURE_SHARE_R30D: { name: "Bagian nominal ke negara yang dipantau", explanation: "Bagian nominal dengan negara pihak lawan yang ada dalam daftar pemantauan organisasi.", kind: "share" },
  PASSTHROUGH_RATIO_MAX_R7D: { name: "Perbandingan dana masuk dan keluar cepat", explanation: "Perbandingan dana yang keluar segera setelah dana masuk menurut jendela pengamatan model.", kind: "share" },
  NEW_DEVICE_R7D: { name: "Perangkat belum terlihat sebelumnya", explanation: "Penanda perangkat yang belum terlihat pada riwayat nasabah sebelum minggu ini.", kind: "flag" },
  NEW_COUNTERPARTY_SHARE_R7D: { name: "Bagian pihak transaksi yang baru terlihat", explanation: "Bagian pihak transaksi minggu ini yang belum terlihat pada riwayat sebelumnya.", kind: "share" },
  P02_BAND_SUM_R7D: { name: "Total nominal mendekati batas", explanation: "Total nominal transaksi dalam rentang yang dipantau selama tujuh hari.", kind: "money" },
  P02_BAND_SUM_ROLLING_7D: { name: "Total nominal kelompok mendekati batas", explanation: "Total nominal kelompok transaksi pada jendela tujuh hari yang dipantau.", kind: "money" },
  MAX_R7D_OVER_OWN_P95: { name: "Transaksi terbesar dibanding riwayat", explanation: "Nominal terbesar minggu ini dibanding batas 95% nominal pada 90 hari sebelum minggu penilaian.", kind: "ratio" },
  PASSTHROUGH_CREDITS_R7D: { name: "Dana masuk yang memenuhi syarat pengamatan", explanation: "Jumlah transaksi masuk yang memenuhi batas nominal pada konfigurasi fitur.", kind: "count" },
  COUNT_R7D_OVER_BASELINE: { name: "Frekuensi mingguan dibanding kebiasaan", explanation: "Perbandingan jumlah transaksi minggu ini dengan rata-rata minggu sebelumnya; rumus model menambahkan satu pada kedua jumlah.", kind: "ratio" },
  ROUND_COUNT_R30D: { name: "Transaksi bernominal bulat dalam 30 hari", explanation: "Jumlah transaksi yang memenuhi batas dan kelipatan nominal pada konfigurasi fitur.", kind: "count" },
  GEO_EXPOSURE_COUNT_R30D: { name: "Transaksi terkait negara yang dipantau", explanation: "Jumlah transaksi dengan negara pihak lawan yang ada dalam daftar organisasi.", kind: "count" },
  GEO_EXPOSURE_SUM_R30D: { name: "Nominal terkait negara yang dipantau", explanation: "Total nominal transaksi dengan negara pihak lawan yang ada dalam daftar organisasi.", kind: "money" },
  AVG_TICKET_R30D: { name: "Rata-rata pembayaran merchant", explanation: "Rata-rata pembayaran masuk melalui merchant milik nasabah usaha pada 30 hari penilaian.", kind: "money" },
  TICKET_MULTIPLE_R30D: { name: "Pembayaran merchant dibanding jenis usahanya", explanation: "Perbandingan rata-rata pembayaran dengan pembanding kategori usaha yang dibekukan saat pelatihan.", kind: "ratio" },
  OFF_HOURS_SHARE_R30D: { name: "Pembayaran di luar jam layanan usaha", explanation: "Bagian pembayaran di luar jam layanan yang dinyatakan merchant.", kind: "share" },
  PAYER_TOP5_SHARE_R30D: { name: "Nominal dari lima pembayar terbesar", explanation: "Bagian nominal pembayaran masuk yang berasal dari lima pembayar terbesar.", kind: "share" },
  REVERSAL_RATE_R30D: { name: "Transaksi yang dibalik menurut sumber", explanation: "Bagian transaksi yang sumbernya mencatat status REVERSED.", kind: "share" },
  FUNNEL_IN_DEGREE_R7D: { name: "Pihak pengirim dana berbeda", explanation: "Jumlah pihak berbeda yang mengirim dana masuk dalam tujuh hari.", kind: "count" },
  FUNNEL_OUT_DEGREE_R7D: { name: "Pihak penerima dana berbeda", explanation: "Jumlah pihak berbeda yang menerima dana keluar dalam tujuh hari.", kind: "count" },
  FUNNEL_IN_DEGREE_ROLLING_7D: { name: "Kelompok pengirim dana berbeda", explanation: "Jumlah pengirim berbeda terbesar pada jendela tujuh hari yang diamati.", kind: "count" },
  TIME_COMPRESSION_R7D: { name: "Dana masuk dalam waktu berdekatan", explanation: "Bagian nominal masuk terbesar yang terjadi dalam jendela waktu pemantauan fitur.", kind: "share" },
  INBOUND_AMOUNT_CV_R7D: { name: "Variasi nominal dana masuk", explanation: "Ukuran variasi nominal dana masuk dibanding rata-ratanya. Nilai ini bukan persentase risiko." },
  Z_TXN_COUNT_W: { name: "Perbedaan jumlah transaksi dari riwayat", explanation: "Ukuran perbedaan jumlah transaksi mingguan setelah memperhitungkan variasi riwayat. Bukan persentase." },
  Z_TXN_VALUE_W: { name: "Perbedaan nominal dari riwayat mingguan", explanation: "Ukuran perbedaan total nominal mingguan setelah memperhitungkan variasi riwayat. Bukan persentase." },
  Z_DISTINCT_COUNTERPARTIES_W: { name: "Perbedaan jumlah pihak transaksi", explanation: "Ukuran perbedaan jumlah pihak transaksi dari kebiasaan mingguan sebelumnya." },
  CHANNEL_MIX_JSD: { name: "Perubahan pola kanal transaksi", explanation: "Ukuran matematika perbedaan pemakaian kanal dengan riwayat. Angka ini bukan persentase risiko." },
  HOUR_PROFILE_JSD: { name: "Perubahan pola waktu transaksi", explanation: "Ukuran matematika perbedaan pola waktu dengan riwayat. Angka ini bukan jam atau persentase risiko." },
  BASELINE_CV: { name: "Variasi pada riwayat pembanding", explanation: "Perbandingan variasi nominal mingguan dengan rata-ratanya pada riwayat pembanding." },
};

export function featureDisplayName(code: string): string {
  const sum = /^(TXN_VALUE_SUM|INBOUND_SUM|OUTBOUND_SUM)_R(7|30|90)D$/.exec(code);
  if (sum) return `${sum[1] === "INBOUND_SUM" ? "Dana masuk" : sum[1] === "OUTBOUND_SUM" ? "Dana keluar" : "Total nominal transaksi"} dalam ${sum[2]} hari`;
  if (code === "TXN_VALUE_MAX_R7D") return "Transaksi terbesar dalam 7 hari";
  return (FEATURES[code] ?? LEGACY[code])?.name ?? "Indikator tambahan";
}

export function featureExplanation(code: string): string {
  if (/^(TXN_VALUE_SUM|INBOUND_SUM|OUTBOUND_SUM)_R(7|30|90)D$/.test(code) || code === "TXN_VALUE_MAX_R7D") return "Nominal yang diamati selama periode penilaian pada data model ini.";
  return (FEATURES[code] ?? LEGACY[code])?.explanation
    ?? "Penjelasan sederhana untuk indikator ini belum tersedia. Definisi asli dan kode indikator dapat dibaca di detail teknis.";
}

export function scoreNumber(value: number, comparison?: number): string {
  if (!Number.isFinite(value)) return "Tidak tersedia";
  const render = (number: number, digits: number) => number !== 0 && Math.abs(number) < 0.01
    ? number.toLocaleString("id-ID", { maximumSignificantDigits: digits, useGrouping: false })
    : number.toLocaleString("id-ID", { maximumFractionDigits: digits, minimumFractionDigits: 3 });
  let digits = value !== 0 && Math.abs(value) < 0.01 ? 2 : 3;
  if (comparison !== undefined && Number.isFinite(comparison) && value !== comparison) {
    while (digits < 15 && render(value, digits) === render(comparison, digits)) digits += 1;
  }
  return render(value, digits);
}

export function featureValue(contribution: Pick<Contribution, "feature" | "value">, score: Pick<ModelScore, "currency" | "feature_set_version">): string {
  const value = contribution.value;
  if (value === null || !Number.isFinite(value)) return "Belum tersedia";
  const kind = (FEATURES[contribution.feature] ?? LEGACY[contribution.feature])?.kind
    ?? (/^(TXN_VALUE_SUM|INBOUND_SUM|OUTBOUND_SUM)_R(7|30|90)D$/.test(contribution.feature) || contribution.feature === "TXN_VALUE_MAX_R7D" ? "money" : undefined);
  if (contribution.feature === "NO_BASELINE") return value === 1 ? "Riwayat belum cukup" : value === 0 ? "Syarat riwayat terpenuhi" : String(value);
  if (contribution.feature === "IS_DEBIT" || contribution.feature === "IS_OUTBOUND") return value === 1 ? "Dana keluar" : value === 0 ? "Dana masuk" : String(value);
  if (contribution.feature === "DAY_ONLY_TIMESTAMP") return value === 1 ? "Tanggal tanpa jam rinci" : value === 0 ? "Waktu tersedia" : String(value);
  if (contribution.feature === "CHANNEL_UNSEEN") return value === 1 ? "Belum ada di data belajar" : value === 0 ? "Ada di data belajar" : String(value);
  if (["DEVICE_FIRST_USE", "IP_FIRST_USE", "LOCATION_FIRST_USE", "MERCHANT_FIRST_USE", "COUNTERPARTY_FIRST_USE", "NEW_DEVICE_R7D"].includes(contribution.feature)) return value === 1 ? "Belum terlihat sebelumnya" : value === 0 ? "Pernah terlihat sebelumnya" : String(value);
  if (["DEVICE_PRESENT", "IP_PRESENT", "LOCATION_PRESENT"].includes(contribution.feature)) return value === 1 ? "Data tersedia" : value === 0 ? "Data tidak tersedia" : String(value);
  if (contribution.feature === "ENTITY_IS_BUSINESS") return value === 1 ? "Nasabah usaha" : value === 0 ? "Nasabah perorangan" : String(value);
  if (contribution.feature === "COUNTERPARTY_COUNTRY_LISTED") return value === 1 ? "Ada dalam daftar pemantauan" : value === 0 ? "Tidak ada dalam daftar" : String(value);
  if (kind === "flag") return value === 1 ? "Ya, tercatat" : value === 0 ? "Tidak tercatat" : String(value);
  if (kind === "money") {
    const currency = score.currency ?? (score.feature_set_version === "fs_v2" ? "IDR" : null);
    return currency ? formatAmount(String(value), currency) : `${value.toLocaleString("id-ID")} · mata uang belum tersedia`;
  }
  if (kind === "days") return `${value.toLocaleString("id-ID", { maximumFractionDigits: 1 })} hari`;
  if (kind === "ratio") return `${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })} kali`;
  if (kind === "share") return `${(value * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}% dari kelompok pembanding`;
  if (kind === "count") return value.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  return value.toLocaleString("id-ID", { maximumFractionDigits: 4 });
}

const PATTERNS: Record<string, { title: string; summary: string; hint: string }> = {
  P01: { title: "Nominal transaksi besar", summary: "Aturan memantau nominal yang melewati batas konfigurasi atau jauh di atas riwayat nasabah.", hint: "Periksa tujuan pembayaran dan apakah nominalnya sesuai aktivitas nasabah." },
  P02: { title: "Beberapa transaksi mendekati batas nominal", summary: "Aturan menemukan kelompok transaksi di bawah batas nominal yang dipantau, dengan total yang memenuhi aturan.", hint: "Periksa apakah ada alasan wajar untuk membagi pembayaran, beserta pihak penerimanya." },
  P03: { title: "Dana masuk lalu cepat keluar", summary: "Aturan menemukan dana keluar dalam waktu berdekatan setelah dana masuk pada rekening.", hint: "Periksa sumber dana, tujuan transfer berikutnya, dan apakah aliran tersebut sesuai kegiatan nasabah." },
  P04: { title: "Frekuensi transaksi meningkat", summary: "Aturan memantau banyaknya transaksi dalam suatu periode dibanding riwayat aktivitas sebelumnya.", hint: "Periksa apakah rangkaian transaksi sesuai kebutuhan pengguna, misalnya pembayaran bisnis yang sah." },
  P05: { title: "Rekening kembali aktif setelah jeda panjang", summary: "Aturan memantau aktivitas setelah jeda yang terlihat di antara transaksi rekening.", hint: "Periksa konteks aktivasi kembali dan apakah transaksi dilakukan dengan otorisasi pemilik rekening." },
  P06: { title: "Pola nominal bulat yang berulang", summary: "Aturan memantau kelompok transaksi dengan kelipatan nominal tertentu.", hint: "Periksa tujuan pembayaran; nominal bulat juga dapat muncul pada aktivitas yang sah." },
  P07: { title: "Total transaksi mingguan meningkat", summary: "Aturan membandingkan total nominal satu minggu dengan riwayat mingguan sebelumnya.", hint: "Periksa apakah kenaikan berkaitan dengan aktivitas usaha atau kebutuhan nasabah yang dapat dijelaskan." },
  P08: { title: "Transaksi terkait negara yang dipantau", summary: "Negara pihak lawan transaksi cocok dengan daftar pemantauan yang dikonfigurasi organisasi.", hint: "Periksa pihak lawan dan tujuan transaksi. Kecocokan negara saja bukan konfirmasi pelanggaran." },
  P09: { title: "Perangkat dipakai beberapa nasabah", summary: "Aturan memantau perangkat yang terhubung ke beberapa nasabah atau rekening.", hint: "Periksa hubungan antar pengguna; satu perangkat bisa digunakan bersama secara sah." },
  P10: { title: "Aktivitas merchant perlu diperiksa", summary: "Aturan memantau aktivitas penerima pembayaran usaha yang memenuhi kondisi pemantauan.", hint: "Periksa jenis usaha, jadwal layanan, pengembalian dana dan konteks pembayaran merchant." },
  P11: { title: "Pola aliran dana antarrekening", summary: "Pola ini berkaitan dengan hubungan dan aliran dana dari beberapa pihak.", hint: "Periksa hubungan dan rangkaian transaksi sebelum mengambil kesimpulan." },
  P12: { title: "Kemungkinan kecocokan daftar pemantauan", summary: "Temuan ini memerlukan pemeriksaan kecocokan identitas oleh manusia.", hint: "Periksa identitas dan sumber daftar sebelum menyimpulkan ada kecocokan." },
  ML_SCORE: { title: "Skor melewati batas peninjauan", summary: "Gabungan indikator yang dipelajari model menghasilkan skor pada atau di atas batas peninjauan.", hint: "Cocokkan indikator dengan transaksi dan konteks nasabah. Skor tidak menetapkan bahwa fraud atau pencucian uang terjadi." },
};

function pattern(code: string) { return PATTERNS[code === "ML_SCORE" ? code : /^P\d{2}/.exec(code)?.[0] ?? code]; }
export function patternTitle(code: string): string { return pattern(code)?.title ?? "Temuan untuk ditinjau"; }
export function patternSummary(code: string): string { return pattern(code)?.summary ?? "Sistem menyimpan temuan ini untuk ditinjau. Baca detail penilaian sebelum menentukan tindak lanjut."; }

export interface Observation { label: string; value: string; help?: string }
export interface AlertExplanation { title: string; summary: string; observations: Observation[]; hint: string; limitations: string[] }

export function alertExplanation(alert: AlertDetail): AlertExplanation {
  const d = alert.detection_details;
  const code = alert.pattern_code === "ML_SCORE" ? "ML_SCORE" : /^P\d{2}/.exec(alert.pattern_code)?.[0] ?? alert.pattern_code;
  const observations: Observation[] = [];
  const limitations: string[] = [];
  const currency = typeof d.CURRENCY === "string" ? d.CURRENCY
    : alert.transactions.length > 0 && new Set(alert.transactions.map((t) => t.currency)).size === 1 ? alert.transactions[0].currency : null;
  const number = (key: string): number | null => {
    const value = d[key];
    return (typeof value === "number" || (typeof value === "string" && value.trim() !== "")) && Number.isFinite(Number(value)) ? Number(value) : null;
  };
  const add = (key: string, label: string, kind: "number" | "money" | "days" | "hours" | "share" | "ratio" = "number", help?: string) => {
    const value = number(key);
    if (value === null) return;
    const displayed = key === "SCORE" || key === "THRESHOLD" ? scoreNumber(value, number(key === "SCORE" ? "THRESHOLD" : "SCORE") ?? undefined)
      : kind === "money" ? currency ? formatAmount(String(value), currency) : `${value.toLocaleString("id-ID")} · mata uang belum tersedia`
      : kind === "share" ? `${(value * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`
      : `${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })}${kind === "days" ? " hari" : kind === "hours" ? " jam" : kind === "ratio" ? " kali" : ""}`;
    observations.push({ label, value: displayed, help });
  };
  if (code === "ML_SCORE") {
    // These are the alert's own stored observation values. Do not reconstruct
    // their association from whichever scores happen to be visible elsewhere.
    const stored = Array.isArray(d.CONTRIBUTIONS) ? d.CONTRIBUTIONS.filter((entry): entry is { feature: string; value: number | null } => (
      entry !== null && typeof entry === "object" && !Array.isArray(entry)
      && Object.prototype.hasOwnProperty.call(entry, "feature") && typeof entry.feature === "string" && entry.feature.trim() !== ""
      && Object.prototype.hasOwnProperty.call(entry, "value") && (entry.value === null || (typeof entry.value === "number" && Number.isFinite(entry.value)))
    )).slice(0, 2) : [];
    if (stored.length > 0) {
      const sourceIds = Array.isArray(d.SCORE_IDS) ? d.SCORE_IDS.filter((id): id is string => typeof id === "string") : [];
      const matching = typeof d.MODEL_VERSION === "string" ? (alert.model_signals ?? []).filter((signal) => (
        signal.model_version === d.MODEL_VERSION && sourceIds.includes(signal.id)
      )) : [];
      const currencies = new Set(matching.map((signal) => signal.currency));
      const modelCurrency = matching.length > 0 && currencies.size === 1
        && matching.every((signal) => typeof signal.currency === "string" && /^[A-Z]{3}$/.test(signal.currency))
        ? matching[0].currency : undefined;
      for (const item of stored) observations.push({
        label: featureDisplayName(item.feature),
        value: featureValue(item, { currency: modelCurrency }),
        help: featureExplanation(item.feature),
      });
    }
    add("SCORE", "Skor penilaian model", "number", "Angka penilaian model, bukan persentase kemungkinan fraud.");
    add("THRESHOLD", "Batas agar perlu ditinjau", "number", "Jika skor sama dengan atau lebih besar dari batas ini, sistem membuat temuan.");
  } else if (code === "P01") {
    add("AMOUNT_IDR", "Nominal transaksi", "money");
    if (d.ABS_CONDITION_MET === true) add("ABS_THRESHOLD_APPLIED", "Batas nominal yang terlewati", "money");
    if (d.REL_CONDITION_MET === true) add("RELATIVE_MULTIPLE_OBSERVED", "Perbandingan dengan transaksi besar sebelumnya", "ratio", "Dibandingkan dengan batas yang mencakup 95% nominal pada riwayat sebelumnya.");
    if (d.ENTITY_P95_90D === null) limitations.push("Pembanding transaksi besar dari riwayat nasabah belum tersedia. Temuan dapat berasal dari batas nominal tetap.");
  } else if (code === "P02") {
    add("TXN_COUNT_IN_BAND", "Transaksi dalam rentang yang dipantau");
    add("AGGREGATE_AMOUNT", "Total nominal kelompok transaksi", "money");
    add("WINDOW_DAYS_APPLIED", "Lama periode pemantauan", "days");
    if (number("BAND_LOWER_APPLIED") !== null && number("THRESHOLD_APPLIED") !== null) observations.push({ label: "Rentang nominal per transaksi", value: `${currency ? formatAmount(String(d.BAND_LOWER_APPLIED), currency) : String(d.BAND_LOWER_APPLIED)} hingga di bawah ${currency ? formatAmount(String(d.THRESHOLD_APPLIED), currency) : String(d.THRESHOLD_APPLIED)}` });
  } else if (code === "P03") {
    add("INBOUND_AMOUNT", "Dana masuk yang diamati", "money");
    add("OUTBOUND_AGGREGATE", "Dana keluar setelahnya", "money");
    add("ELAPSED_HOURS", "Jarak waktu aliran dana", "hours");
    add("PASSTHROUGH_RATIO", "Perbandingan nominal keluar dan masuk", "share", "Perbandingan nominal tidak membuktikan bahwa uang yang sama dipindahkan.");
  } else if (code === "P04") {
    add("TXN_COUNT_WINDOW", "Transaksi pada periode pemantauan");
    add("BASELINE_MEAN_COUNT", "Rata-rata transaksi harian sebelumnya", "number", "Pembanding harian yang disimpan saat aturan dijalankan.");
    add("BASELINE_DAYS_AVAILABLE", "Riwayat yang dipakai membandingkan", "days");
    add("VALUE_WINDOW", "Total nominal pada periode ini", "money");
  } else if (code === "P05") {
    add("DORMANCY_DAYS_OBSERVED", "Jeda di antara aktivitas rekening", "days");
    add("REACTIVATION_TXN_COUNT", "Transaksi setelah rekening kembali aktif");
    add("REACTIVATION_AGGREGATE", "Total nominal aktivitas baru", "money");
  } else if (code === "P06") {
    add("ROUND_TXN_COUNT", "Transaksi dengan nominal bulat");
    add("TOTAL_QUALIFYING_TXN_COUNT", "Transaksi yang memenuhi syarat pengamatan");
    add("ROUNDING_UNIT_APPLIED", "Kelipatan nominal yang dipantau", "money");
    add("ROUND_PROPORTION", "Bagian transaksi bernominal bulat", "share");
  } else if (code === "P07") {
    add("PERIOD_VALUE", "Total nominal minggu ini", "money");
    add("BASELINE_MEAN_WEEKLY", "Rata-rata nominal minggu sebelumnya", "money");
    add("SPIKE_MULTIPLE", "Perbandingan dengan riwayat mingguan", "ratio");
    add("BASELINE_WEEKS_AVAILABLE", "Jumlah minggu pembanding");
  } else if (code === "P08") {
    if (Array.isArray(d.COUNTRY_CODES)) observations.push({ label: "Kode negara pihak transaksi", value: d.COUNTRY_CODES.map(String).join(", ") });
    add("TXN_COUNT", "Transaksi terkait negara yang dipantau");
    add("AGGREGATE_AMOUNT", "Total nominal terkait", "money");
    add("EXPOSURE_SHARE", "Bagian dari total nominal nasabah", "share");
  } else if (code === "P09") {
    add("DISTINCT_ENTITY_COUNT", "Nasabah pada perangkat yang sama");
    add("DISTINCT_ACCOUNT_COUNT", "Rekening pada perangkat yang sama");
    if (d.HOUSEHOLD_RELATION_COUNT === "DATA_UNAVAILABLE") limitations.push("Hubungan keluarga atau rumah tangga antar pengguna belum tersedia. Penggunaan perangkat bersama belum menjelaskan tujuan transaksi.");
  } else if (code === "P10") {
    add("TXN_COUNT_WINDOW", "Transaksi merchant yang diamati");
    add("AVG_TICKET", "Rata-rata nominal pembayaran", "money");
    add("REFUND_RATE", "Bagian transaksi pengembalian dana", "share");
    add("PAYER_CONCENTRATION", "Bagian nominal dari lima pembayar terbesar", "share");
    if (d.MERCHANT_AGE_DAYS === "DATA_UNAVAILABLE") limitations.push("Lama usaha merchant belum tersedia dalam data penilaian ini.");
  }
  if (observations.length === 0) {
    limitations.push("Rincian angka untuk penjelasan sederhana belum tersedia. Periksa catatan asli dan transaksi terkait di bawah.");
    observations.push({ label: "Transaksi yang ditautkan ke temuan", value: alert.transactions.length.toLocaleString("id-ID"), help: "Jumlah referensi tersimpan, bukan jumlah transaksi fraud yang terkonfirmasi." });
  }
  return { title: patternTitle(alert.pattern_code), summary: patternSummary(alert.pattern_code), observations,
    hint: pattern(alert.pattern_code)?.hint ?? "Periksa transaksi dan konteks nasabah sebelum menentukan tindak lanjut.", limitations };
}
