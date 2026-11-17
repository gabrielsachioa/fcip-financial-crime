import axios from "axios";

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return "Belum dapat terhubung ke layanan. Periksa koneksi Anda, lalu coba lagi.";
    }
    const detail = (error.response.data as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === "string") {
      const known: Record<string, string> = {
        "Invalid email or password": "Email atau kata sandi belum cocok. Periksa kembali isian Anda, lalu coba lagi.",
        "Account locked, try again later": "Akun dikunci sementara setelah beberapa percobaan masuk. Tunggu beberapa saat sebelum mencoba kembali.",
        "Forbidden": "Akun Anda belum memiliki izin untuk tindakan ini. Hubungi pengelola jika akses diperlukan.",
        "Not authenticated": "Silakan masuk terlebih dahulu untuk membuka ruang kerja.",
      };
      if (known[detail]) return known[detail];
      return detail;
    }
    if (Array.isArray(detail)) {
      return detail
        .map((item: { msg?: unknown }) => (typeof item.msg === "string" ? item.msg : JSON.stringify(item)))
        .join("; ");
    }
    if (error.response.status === 401) return "Sesi masuk berakhir. Silakan masuk kembali.";
    if (error.response.status === 403) return "Akun Anda belum memiliki izin untuk tindakan ini. Hubungi pengelola jika akses diperlukan.";
    return `Permintaan belum berhasil (kode ${error.response.status}). Coba lagi atau hubungi pengelola jika masalah berlanjut.`;
  }
  return error instanceof Error ? error.message : "Terjadi kendala yang belum dikenali. Silakan coba lagi.";
}
