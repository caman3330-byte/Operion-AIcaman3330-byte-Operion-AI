import "./globals.css";

export const metadata = {
  title: "Operion Capital",
  description: "Private capital access, business funding preparation, and lender matching for growth-focused businesses."
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
