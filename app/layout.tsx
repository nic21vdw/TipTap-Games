import type { Metadata, Viewport } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>
        {children}
        <div className="fx-grain" />
        <div className="fx-scanlines" />
      </body>
    </html>
  );
}
