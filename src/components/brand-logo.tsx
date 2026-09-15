import Image from "next/image";

/** Original easy4tutor artwork, exported without changing its geometry or colors. */
export function BrandLogo() {
  return (
    <span className="brand-artwork">
      <Image
        className="brand-symbol"
        src="/brand/easy4tutor-symbol.png"
        width={498}
        height={404}
        alt=""
        aria-hidden="true"
        unoptimized
      />
      <Image
        className="brand-wordmark"
        src="/brand/easy4tutor-wordmark.png"
        width={906}
        height={190}
        alt="easy4tutor"
        unoptimized
      />
      <span className="brand-compact-label sr-only">easy4tutor</span>
    </span>
  );
}
