import Image from "next/image";

/** Supplied blue artwork. CSS frames its existing symbol and wordmark without redrawing it. */
export function BrandLogo() {
  return (
    <span className="brand-artwork">
      <span className="brand-symbol brand-image-frame" aria-hidden="true">
        <Image
          src="/brand/easy4tutor-blue-original.png"
          width={1254}
          height={1254}
          alt=""
          loading="eager"
          sizes="320px"
        />
      </span>
      <span className="brand-wordmark brand-image-frame">
        <Image
          src="/brand/easy4tutor-blue-original.png"
          width={1254}
          height={1254}
          alt="easy4tutor"
          loading="eager"
          sizes="320px"
        />
      </span>
      <span className="brand-compact-label sr-only">easy4tutor</span>
    </span>
  );
}
