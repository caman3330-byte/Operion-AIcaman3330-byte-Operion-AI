import "./globals.css";

export const metadata = {
  title: "Operion Capital",
  description: "AI-powered MCA funding, business loans, and lender matching for growing businesses."
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
