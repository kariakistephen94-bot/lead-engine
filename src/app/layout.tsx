import type { Metadata } from "next";

import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AI Lead Engine",
    template: "%s · AI Lead Engine",
  },
  description: "Internal lead database, prospecting engine and sales pipeline.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
