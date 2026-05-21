import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-card/90 p-6 shadow-2xl shadow-black/20">
        <h1 className="text-xl font-semibold">Unauthorized</h1>
        <p className="mt-4 text-sm text-muted-foreground">You do not have permission to access this area.</p>
        <div className="mt-6 flex justify-end">
          <Link href="/signin" className="text-primary hover:underline">
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
