import type { Metadata, Viewport } from "next";
import { Alegreya, Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

const display = Alegreya({ subsets: ["latin", "vietnamese"], weight: ["700", "800"], variable: "--font-display" });
const body = Be_Vietnam_Pro({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Dòng Sông Thời Đại",
  description: "Dựng thành phố ven sông từ thời đồ đá tới thời đồ sắt.",
};
export const viewport: Viewport = { themeColor: "#17201e", viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
