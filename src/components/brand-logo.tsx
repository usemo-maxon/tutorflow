import Image from "next/image";

/** Supplied Easy4Tutor artwork with its background removed. */
export function BrandLogo() {
  return (
    <span className="brand-artwork">
      <Image
        className="brand-logo-full brand-logo-light"
        src="/brand/easy4tutor-logo-transparent.png"
        width={1465}
        height={283}
        alt="easy4tutor"
        loading="eager"
        sizes="200px"
      />
      <Image
        className="brand-logo-compact brand-logo-light"
        src="/brand/easy4tutor-monogram-transparent.png"
        width={502}
        height={283}
        alt="easy4tutor"
        loading="eager"
        sizes="60px"
      />
      <Image
        className="brand-logo-full brand-logo-dark"
        src="/brand/easy4tutor-logo-dark-transparent.png"
        width={1465}
        height={283}
        alt="easy4tutor"
        loading="eager"
        sizes="200px"
      />
      <Image
        className="brand-logo-compact brand-logo-dark"
        src="/brand/easy4tutor-monogram-transparent.png"
        width={502}
        height={283}
        alt="easy4tutor"
        loading="eager"
        sizes="60px"
      />
    </span>
  );
}
