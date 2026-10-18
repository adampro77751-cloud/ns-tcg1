import Image from "next/image";

export function SpriteArt({ image, name, large = false }: { image: string | null; name: string; large?: boolean }) {
  if (!image) return null;
  return (
    <div className={`relative aspect-[5/7] overflow-hidden rounded-lg bg-slate-950 ${large ? "mx-auto my-6 w-full max-w-sm" : "w-full"}`}>
      <Image src={image} alt={name} fill sizes={large ? "(max-width: 640px) 90vw, 384px" : "(max-width: 640px) 45vw, 220px"} className="object-contain" />
    </div>
  );
}
