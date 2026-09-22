import type { Metadata, Viewport } from "next";

/**
 * Admin portal PWA scope: everything installed from `/admin121210` keeps the admin
 * start_url, while the root layout keeps the student-facing manifest at `/manifest.json`.
 */
export const metadata: Metadata = {
  title: "طايو — بوابة التحكم والإدارة",
  description: "بوابة الخدام وأدمن الكنيسة ومدير النظام.",
  manifest: "/admin121210/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "طايو إدارة",
  },
};

export const viewport: Viewport = {
  themeColor: "#1e3a5f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function AdminPortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
