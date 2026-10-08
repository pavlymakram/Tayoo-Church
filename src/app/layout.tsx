import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import { Toaster } from "sonner";
import {
  AuthProvider,
  OfflineBanner,
  OfflineProvider,
} from "@/components/providers/auth-provider";
import { PwaRegister } from "@/components/providers/pwa-register";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "طايو — نظام إدارة الخدمة والنقاط",
  description:
    "منصة كنائس متعددة المستأجرين لإدارة حضور المخدومين، نقاط طايو، والافتقاد.",
  applicationName: "طايو",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "طايو",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1e3a5f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className="font-sans antialiased">
        <AuthProvider>
          <OfflineProvider>
            <OfflineBanner />
            {children}
            <Toaster
              position="top-center"
              dir="rtl"
              richColors
              toastOptions={{ className: "font-sans" }}
            />
            <PwaRegister />
          </OfflineProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
