export interface TaxonomyEntry {
  section: string;
  category: string;
  subCategory: string;
  product: string;
}

export const TAXONOMY: TaxonomyEntry[] = [
  // Apparel Section
  { section: 'Apparel', category: "Men's Clothing", subCategory: 'Sweatshirts', product: 'Sweatshirt' },
  { section: 'Apparel', category: "Men's Clothing", subCategory: 'T-Shirts', product: 'T-Shirt' },
  { section: 'Apparel', category: "Men's Clothing", subCategory: 'Hoodies', product: 'Hoodie' },
  { section: 'Apparel', category: "Men's Clothing", subCategory: 'Pants', product: 'Pants' },
  { section: 'Apparel', category: "Men's Clothing", subCategory: 'Jackets', product: 'Jacket' },
  
  { section: 'Apparel', category: "Women's Clothing", subCategory: 'Sweatshirts', product: 'Sweatshirt' },
  { section: 'Apparel', category: "Women's Clothing", subCategory: 'T-Shirts', product: 'T-Shirt' },
  { section: 'Apparel', category: "Women's Clothing", subCategory: 'Hoodies', product: 'Hoodie' },
  { section: 'Apparel', category: "Women's Clothing", subCategory: 'Dresses', product: 'Dress' },
  { section: 'Apparel', category: "Women's Clothing", subCategory: 'Skirts', product: 'Skirt' },
  { section: 'Apparel', category: "Women's Clothing", subCategory: 'Pants', product: 'Pants' },
  { section: 'Apparel', category: "Women's Clothing", subCategory: 'Jackets', product: 'Jacket' },
  
  { section: 'Apparel', category: "Kids' Clothing", subCategory: 'Sweatshirts', product: 'Sweatshirt' },
  { section: 'Apparel', category: "Kids' Clothing", subCategory: 'T-Shirts', product: 'T-Shirt' },
  { section: 'Apparel', category: "Kids' Clothing", subCategory: 'Pajamas', product: 'Pajamas' },
  
  // Footwear Section
  { section: 'Footwear', category: 'Footwear', subCategory: 'Sneakers', product: 'Sneakers' },
  { section: 'Footwear', category: 'Footwear', subCategory: 'Sandals', product: 'Sandals' },
  { section: 'Footwear', category: 'Footwear', subCategory: 'Flip Flops', product: 'Flip Flops' },
  { section: 'Footwear', category: 'Footwear', subCategory: 'Boots', product: 'Boots' },
  { section: 'Footwear', category: 'Footwear', subCategory: 'Slippers', product: 'Slippers' },
  { section: 'Footwear', category: 'Footwear', subCategory: 'Formal Shoes', product: 'Formal Shoes' },
  
  // Sports & Fitness Section
  { section: 'Sports & Fitness', category: 'Fitness Equipment', subCategory: 'Power Loops', product: 'Power Loops' },
  { section: 'Sports & Fitness', category: 'Fitness Equipment', subCategory: 'Resistance Bands', product: 'Resistance Bands' },
  { section: 'Sports & Fitness', category: 'Fitness Equipment', subCategory: 'Knee Support & Braces', product: 'Knee Support' },
  { section: 'Sports & Fitness', category: 'Fitness Equipment', subCategory: 'Dumbbells', product: 'Dumbbells' },
  { section: 'Sports & Fitness', category: 'Sports Accessories', subCategory: 'Swimming Goggles', product: 'Swimming Goggles' },
  
  // Bags & Accessories Section
  { section: 'Bags & Accessories', category: 'Bags', subCategory: 'Handbags', product: 'Handbag' },
  { section: 'Bags & Accessories', category: 'Bags', subCategory: 'Backpacks', product: 'Backpack' },
  { section: 'Bags & Accessories', category: 'Accessories', subCategory: 'Wallets', product: 'Wallet' },
  { section: 'Bags & Accessories', category: 'Accessories', subCategory: 'Belts', product: 'Belt' },
  { section: 'Bags & Accessories', category: 'Accessories', subCategory: 'Sunglasses', product: 'Sunglasses' },
  { section: 'Bags & Accessories', category: 'Accessories', subCategory: 'Watches', product: 'Watch' },
  { section: 'Bags & Accessories', category: 'Jewelry', subCategory: 'Bracelets', product: 'Bracelet' },
  { section: 'Bags & Accessories', category: 'Jewelry', subCategory: 'Earrings', product: 'Earrings' },
  
  // Toys Section
  { section: 'Toys', category: 'Toys', subCategory: 'Action Figures', product: 'Action Figure' },
  { section: 'Toys', category: 'Toys', subCategory: 'Dolls', product: 'Doll' },
  { section: 'Toys', category: 'Toys', subCategory: 'Building Blocks', product: 'Building Blocks' },
  { section: 'Toys', category: 'Toys', subCategory: 'Puzzles', product: 'Puzzle' },
  
  // Other
  { section: 'Other', category: 'Other', subCategory: 'Miscellaneous', product: 'Other / Unclassified' }
];

export function getCategories(): string[] {
  return Array.from(new Set(TAXONOMY.map(t => t.category)));
}

export function getSubCategories(category: string): string[] {
  return Array.from(new Set(
    TAXONOMY.filter(t => t.category === category).map(t => t.subCategory)
  ));
}

export function getProductTypes(category: string, subCategory: string): string[] {
  return Array.from(new Set(
    TAXONOMY.filter(t => t.category === category && t.subCategory === subCategory).map(t => t.product)
  ));
}

// Flat taxonomy text for injecting into the Gemini prompt
export function buildTaxonomyPromptText(): string {
  return TAXONOMY.map(t =>
    `Section: ${t.section} | Category: ${t.category} | Sub-Category: ${t.subCategory} | Product: ${t.product}`
  ).join('\n');
}
