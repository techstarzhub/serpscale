import { redirect } from "next/navigation";

export default function Home() {
  // Auth gating comes later; for now the app opens on the sign-in screen.
  redirect("/login");
}
