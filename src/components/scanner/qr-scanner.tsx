"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { CameraOff } from "lucide-react";
import { Button } from "@/components/ui/form";

export function QrScanner({
  onScan,
  onError,
}: {
  onScan: (value: string) => void;
  onError?: (msg: string) => void;
}) {
  const [active, setActive] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handled = useRef(false);
  const regionId = "tayoo-qr-reader";

  useEffect(() => {
    return () => {
      void stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setFailed(null);
    handled.current = false;
    try {
      const scanner = new Html5Qrcode(regionId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded) => {
          if (handled.current) return;
          handled.current = true;
          onScan(decoded.trim());
          void stop();
        },
        () => undefined
      );
      setActive(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذر فتح الكاميرا";
      setFailed(msg);
      onError?.(msg);
      setActive(false);
    }
  }

  async function stop() {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    setActive(false);
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-3">
      <div
        id={regionId}
        className="overflow-hidden rounded-3xl bg-slate-900/90 min-h-56 [&_video]:rounded-3xl"
      />
      {failed && (
        <div className="flex items-start gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <CameraOff className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {failed}. يمكنك البحث بالاسم أو رقم التليفون بدلاً من المسح.
          </p>
        </div>
      )}
      <div className="flex gap-2">
        {!active ? (
          <Button type="button" className="flex-1" onClick={() => void start()}>
            تشغيل الكاميرا
          </Button>
        ) : (
          <Button type="button" variant="secondary" className="flex-1" onClick={() => void stop()}>
            إيقاف الكاميرا
          </Button>
        )}
      </div>
    </div>
  );
}
