import type { AlertStatus, CaseStatus } from "../types";
import "../review.css";

const labels: Record<string, string> = {
  OPEN: "Menunggu tinjauan", DISPOSED: "Selesai ditinjau", ESCALATED: "Pemeriksaan lanjutan",
  IN_PROGRESS: "Sedang diperiksa", PENDING_CLOSURE: "Menunggu persetujuan penutupan", CLOSED: "Ditutup",
  REOPENED: "Dibuka kembali", REFERRED: "Diteruskan ke pihak terkait",
};

export function StatusBadge({ status, kind = "alert" }: { status: AlertStatus | CaseStatus; kind?: "alert" | "case" }) {
  return (
    <span className={`badge status-badge badge-${status.toLowerCase()}`}>
      <span className="review-status-dot" aria-hidden="true" />
      {status === "OPEN" && kind === "case" ? "Baru dibuat" : labels[status] ?? status.replace(/_/g, " ")}
    </span>
  );
}
