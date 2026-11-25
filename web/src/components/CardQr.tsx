"use client";

import { QRCodeSVG } from "qrcode.react";

export default function CardQr({ value }: { value: string }) {
  return <QRCodeSVG value={value} size={192} level="M" marginSize={0} title={`QR code for card ${value}`} />;
}
