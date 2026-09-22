import { NextResponse } from "next/server";

/**
 * Route-specific PWA manifest for the hidden admin portal.
 *
 * Installing the app from `/admin121210` launches straight back into the admin
 * portal instead of falling back to the student homepage (`start_url: "/"`).
 */
export async function GET() {
  return NextResponse.json(
    {
      name: "طايو — بوابة التحكم والإدارة",
      short_name: "طايو إدارة",
      description: "بوابة الخدام وأدمن الكنيسة ومدير النظام — نظام إدارة الخدمة والنقاط",
      start_url: "/admin121210",
      scope: "/",
      id: "/admin121210",
      display: "standalone",
      orientation: "portrait-primary",
      background_color: "#f7f3eb",
      theme_color: "#1e3a5f",
      lang: "ar",
      dir: "rtl",
      icons: [
        {
          src: "/icons/icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any maskable",
        },
        {
          src: "/icons/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any maskable",
        },
      ],
    },
    {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    }
  );
}
