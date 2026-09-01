import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ارزیابی ۳۶۰ درجه PM",
  description: "ابزار داخلی ارزیابی کامپتنسی PM — بر اساس مدل Ravi Mehta",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css"
        />
      </head>
      <body className="min-h-screen bg-[#faf9f6] text-[#1f2430]" style={{ fontFamily: "Vazirmatn, Tahoma, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
