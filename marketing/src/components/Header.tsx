import { Frag } from "./Frag";
import { AuthNav } from "./AuthNav";

export function Header() {
  return (
    <>
      <Frag file="header.raw.html" />
      <AuthNav />
    </>
  );
}
