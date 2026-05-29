import "./globals.css";
import { operionBrand } from "@/lib/brand/operion";

export const metadata = {
  title: operionBrand.metadata.title,
  description: operionBrand.metadata.description
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
