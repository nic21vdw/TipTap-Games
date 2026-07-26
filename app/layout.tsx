import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import { DevicePreview } from "@/components/shell/DevicePreview";
import "./globals.css";

// Rounded, low-contrast, and quiet at small sizes — the whole UI is one family.
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-nunito",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tip Tap Games",
  description:
    "An endless feed of instant mini games. Swipe for the next one. You control the algorithm.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#f4f8fd",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={nunito.variable}>
      <body>
        {/* owns the desktop/iPhone preview switch; on a phone it renders the
            app untouched. The grain + scanline overlays live inside it so
            they clip to the simulated screen when framed. */}
        <DevicePreview>{children}</DevicePreview>
      </body>
    </html>
  );
}
