import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";

export default async function Home() {
  const auth = await getSessionFromCookies();
  redirect(auth.ok ? "/dashboard" : "/login");
}
