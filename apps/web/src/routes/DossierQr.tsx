import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { api, ApiError } from "../api/client";
import { getSessionGeneration } from "../auth/session";
import "./dossier-qr.css";

type CurrentQr = {
  state: "ACTIVE" | "NOT_ISSUED" | "REVOKED" | "INELIGIBLE";
  canPrint: boolean;
  code: { url: string } | null;
};

const stateMessage = {
  ACTIVE: "Mã QR đang hoạt động.",
  NOT_ISSUED: "Thiết bị chưa được cấp mã QR.",
  REVOKED: "Mã QR đã bị thu hồi.",
  INELIGIBLE: "Thiết bị đã ngừng sử dụng và không đủ điều kiện in tem.",
};

export default function DossierQr({ equipmentId, assetCode }: {
  equipmentId: string;
  assetCode: string;
}) {
  const generation = getSessionGeneration();
  const [revision, setRevision] = useState(0);
  const query = `${equipmentId}:${generation}:${revision}`;
  const [state, setState] = useState<{
    query: string;
    message: string;
    image?: string;
    error?: boolean;
  }>();
  const [printError, setPrintError] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let active = true;
    const apply = (value: Omit<NonNullable<typeof state>, "query">) => {
      if (active && getSessionGeneration() === generation) setState({ query, ...value });
    };
    void api.assetM2<CurrentQr>(`/equipment/${equipmentId}/qr-codes`).then(async qr => {
      const image = qr.state === "ACTIVE" && qr.canPrint && qr.code?.url
        ? await QRCode.toDataURL(qr.code.url, { width: 280, margin: 4 })
        : undefined;
      apply({ message: stateMessage[qr.state], image });
    }).catch(error => {
      apply(error instanceof ApiError && [403, 404].includes(error.status)
        ? { message: "Mã QR không khả dụng trong phạm vi tài khoản hiện tại." }
        : { message: "Chưa thể tải mã QR.", error: true });
    });
    return () => { active = false; };
  }, [equipmentId, generation, query]);

  const current = state?.query === query ? state : undefined;
  const qrImage = current?.image;

  async function printLabel(imageUrl: string) {
    setPrintError("");
    const printWindow = frame.current?.contentWindow;
    if (!printWindow) {
      setPrintError("Không thể mở hộp thoại in tem.");
      return;
    }
    const doc = printWindow.document;
    const style = doc.createElement("style");
    style.textContent = "@page { size: 50mm 30mm; margin: 0; } body { margin: 0; width: 50mm; height: 30mm; display: flex; gap: 2mm; align-items: center; justify-content: center; font: 10pt sans-serif; } img { width: 24mm; height: 24mm; } strong { max-width: 21mm; overflow-wrap: anywhere; }";
    const image = doc.createElement("img");
    image.src = imageUrl;
    image.alt = `Mã QR ${assetCode}`;
    const code = doc.createElement("strong");
    code.textContent = assetCode;
    doc.head.replaceChildren(style);
    doc.body.replaceChildren(image, code);
    try {
      await image.decode();
      if (getSessionGeneration() === generation && frame.current?.contentWindow === printWindow) {
        printWindow.focus();
        printWindow.print();
      }
    } catch {
      setPrintError("Không thể chuẩn bị ảnh để in tem.");
    }
  }

  return (
    <section className="m1-card dossier-qr" aria-label="Mã QR thiết bị">
      {qrImage && <img src={qrImage} width={112} height={112} alt={`Mã QR ${assetCode}`} />}
      <div>
        <h2>Mã QR thiết bị</h2>
        <p role="status">{current?.message ?? "Đang tải mã QR…"}</p>
        {qrImage && <button type="button" onClick={() => void printLabel(qrImage)}>In tem QR</button>}
        {current?.error && <button type="button" onClick={() => setRevision(value => value + 1)}>Tải lại mã QR</button>}
        {printError && <p role="alert">{printError}</p>}
      </div>
      <iframe ref={frame} className="dossier-qr-frame" title="Bản in tem QR" tabIndex={-1} aria-hidden="true" />
    </section>
  );
}
