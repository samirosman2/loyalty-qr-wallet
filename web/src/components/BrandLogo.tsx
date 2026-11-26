import type { BrandTheme } from "@/lib/brand";

export default function BrandLogo({ brand }: { brand: BrandTheme }) {
  if (!brand.logo_url) return null;
  return (
    // External URL fallback is intentionally rendered without Next's image optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={brand.logo_url} alt={`${brand.name} logo`} className="mb-4 max-h-20 max-w-48 rounded-lg object-contain" />
  );
}
