import type { Metadata, Viewport } from "next";
import { Alegreya, Be_Vietnam_Pro } from "next/font/google";
import {eraNames,RELEASED_ERA} from '@/lib/eras';
import "./globals.css";
import "./game-ui.css";

const display = Alegreya({ subsets: ["latin", "vietnamese"], weight: ["700", "800"], variable: "--font-display" });
const body = Be_Vietnam_Pro({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600"], variable: "--font-body" });

const siteDescription = `Dựng thành phố ven sông từ thời đồ đá tới ${eraNames[RELEASED_ERA].toLowerCase()}.`;

export const metadata: Metadata = {
  metadataBase: new URL("https://dongchaythoigian.vercel.app"),
  title: "Dòng Chảy Thời Gian",
  description: siteDescription,
  openGraph: {
    type: "website",
    locale: "vi_VN",
    siteName: "Dòng Chảy Thời Gian",
    title: "Dòng Chảy Thời Gian",
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: "Dòng Chảy Thời Gian",
    description: siteDescription,
    images: [{ url: "/opengraph-image.png", alt: "Dòng Chảy Thời Gian — ngôi làng ven sông theo phong cách isometric." }],
  },
};
export const viewport: Viewport = { themeColor: "#17201e", viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
