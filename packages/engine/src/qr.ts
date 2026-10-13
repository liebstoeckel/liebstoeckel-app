import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** A QR data-URL for `url` while `enabled` (no work when closed or off). Dark on white
 *  with a one-module quiet zone; the card around it keeps the white. */
export function useQrDataUrl(url: string | undefined, enabled: boolean): string {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (enabled && url) {
      QRCode.toDataURL(url, { margin: 1, width: 420, color: { dark: "#0b0c10", light: "#ffffff" } })
        .then(setSrc)
        .catch(() => setSrc(""));
    }
  }, [enabled, url]);
  return src;
}
