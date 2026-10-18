export type ShopProduct = {
  id: string; name: string; pricePence: number; coins: number; packs: number;
  packKind: "NORMAL" | "SHINY";
};

export const SHOP_PRODUCTS: readonly ShopProduct[] = [
  { id: "normal-6", name: "6 in-game packs", pricePence: 100, coins: 0, packs: 6, packKind: "NORMAL" },
  { id: "normal-12", name: "12 in-game packs", pricePence: 175, coins: 0, packs: 12, packKind: "NORMAL" },
  { id: "normal-24", name: "24 in-game packs", pricePence: 325, coins: 0, packs: 24, packKind: "NORMAL" },
  { id: "shiny-6", name: "6 shiny in-game packs", pricePence: 200, coins: 0, packs: 6, packKind: "SHINY" },
  { id: "coins-5000", name: "5,000 Coins", pricePence: 100, coins: 5000, packs: 0, packKind: "NORMAL" },
  { id: "coins-10000", name: "10,000 Coins", pricePence: 200, coins: 10000, packs: 0, packKind: "NORMAL" },
  { id: "coins-20000", name: "20,000 Coins", pricePence: 375, coins: 20000, packs: 0, packKind: "NORMAL" },
  { id: "coins-50000", name: "50,000 Coins", pricePence: 600, coins: 50000, packs: 0, packKind: "NORMAL" },
];

export const PHYSICAL_PACKS = [
  { name: "Normal physical pack", pricePence: 50 },
  { name: "Shiny physical pack", pricePence: 100 },
] as const;
export const PHYSICAL_MINIMUM_PENCE = 150;
export const PHYSICAL_SALES_ENABLED = false;

export const formatGBP = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
export class ShopSelectionError extends Error {}

export function getShopProduct(id: string): ShopProduct {
  const product = SHOP_PRODUCTS.find((item) => item.id === id);
  if (!product) throw new ShopSelectionError("Choose a listed bundle.");
  return product;
}
