import { Frag } from "./Frag";
import { FooterSubscribe } from "./FooterSubscribe";

export function Footer() {
  return (
    <>
      <Frag file="footer.raw.html" />
      <FooterSubscribe />
    </>
  );
}
