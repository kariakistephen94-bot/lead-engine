import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getSession()) redirect("/dashboard");
  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
            LE
          </div>
          <h1 className="text-lg font-semibold text-ink">AI Lead Engine</h1>
          <p className="mt-1 text-xs text-ink-soft">Sign in to your prospecting workspace</p>
        </div>
        <LoginForm nextPath={next} />
      </div>
    </main>
  );
}
