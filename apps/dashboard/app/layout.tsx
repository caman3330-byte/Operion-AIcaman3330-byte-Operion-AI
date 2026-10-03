import "./globals.css";
import { operionBrand } from "@/lib/brand/operion";

export const metadata = {
  title: operionBrand.metadata.title,
  description: operionBrand.metadata.description,
  metadataBase: new URL("https://www.operioncapital.com"),
  alternates: { canonical: "/" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  openGraph: {
    title: operionBrand.metadata.title,
    description: operionBrand.metadata.description,
    url: "https://www.operioncapital.com/",
    siteName: operionBrand.companyName,
    type: "website",
    images: [{ url: "/merchant-journey-opening.webp", width: 768, height: 512, alt: "Operion Capital funding operations" }]
  },
  twitter: {
    card: "summary_large_image",
    title: operionBrand.metadata.title,
    description: operionBrand.metadata.description,
    images: ["/merchant-journey-opening.webp"]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: operionBrand.companyName,
              url: "https://www.operioncapital.com/",
              logo: "https://www.operioncapital.com/icon.svg",
              description: operionBrand.metadata.description
            })
          }}
        />
      </body>
    </html>
  );
}
