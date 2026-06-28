import { buildTaxonomyPromptText } from '../data/taxonomy';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-1.5-flash';

export interface GeminiSuggestion {
  section: string;
  category: string;
  sub_category: string;
  product: string;
  size: string;
  color: string;
  description_ar: string;
  description_en: string;
  brand: string;
  confidence: number;
  notes: string;
}

export async function analyzeProductImage(imageBlob: Blob): Promise<GeminiSuggestion> {
  if (!GEMINI_API_KEY) {
    // Dev fallback — no API key configured
    await new Promise(r => setTimeout(r, 1200));
    return {
      section: 'Apparel',
      category: "Men's Clothing",
      sub_category: 'Sweatshirts',
      product: 'Sweatshirt',
      size: 'L',
      color: 'Wht-Blk',
      description_ar: 'سويتشيرت رجالي أبيض أنيق ومريح بياقة دائرية. يتميز بتصميم عصري ملائم للارتداء اليومي.',
      description_en: 'Stylish and comfortable men\'s white sweatshirt. Features a modern crewneck design perfect for daily wear.',
      brand: 'Unknown',
      confidence: 0.9,
      notes: 'Mock response — set VITE_GEMINI_API_KEY to use real vision analysis'
    };
  }

  const base64 = await blobToBase64(imageBlob);
  const taxonomy = buildTaxonomyPromptText();

  const prompt = `You are a professional product cataloging assistant for an e-commerce platform.
Analyze this product image carefully. Extract and classify its details based strictly on the provided taxonomy, and write high-quality e-commerce product descriptions in both Arabic and English.

Taxonomy Rules (select the exact match for section, category, sub_category, and product):
${taxonomy}

Return ONLY valid JSON matching this schema:
{
  "section": "<exact section from taxonomy>",
  "category": "<exact category from taxonomy>",
  "sub_category": "<exact sub-category from taxonomy>",
  "product": "<exact product name from taxonomy>",
  "size": "<size like S, M, L, XL or shoes size if clearly visible on a tag, otherwise leave blank>",
  "color": "<color of the product using standard abbreviation codes e.g. Wht, Blk, Wht-Gry, Blu, Red, Grn, Org, Pnk, Ylw, etc.>",
  "description_ar": "<compelling, marketing-grade Arabic product description focusing on the style, features, and comfort, suitable for e-commerce. Keep it natural and professional, about 1-2 sentences>",
  "description_en": "<compelling, marketing-grade English product description focusing on the style, features, and comfort, suitable for e-commerce. Keep it natural and professional, about 1-2 sentences>",
  "brand": "<brand name if clearly visible on product tags or logos, otherwise Unknown>",
  "confidence": <confidence score between 0.0 and 1.0>,
  "notes": "<any other details visible like material, model number, packaging details>"
}

Rules:
1. "section", "category", "sub_category", and "product" MUST match one of the valid taxonomy rows exactly.
2. The product descriptions must be clean, enticing, and professional.
3. Return ONLY the JSON object, do not wrap in markdown or anything else.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inlineData: {
                mimeType: imageBlob.type || 'image/jpeg',
                data: base64
              }
            },
            { text: prompt }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          topP: 0.8,
          maxOutputTokens: 512
        }
      })
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  if (!rawText) {
    throw new Error('Gemini returned an empty response');
  }

  // Strip any markdown code fences Gemini may still wrap around JSON
  const cleaned = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  try {
    const suggestion: GeminiSuggestion = JSON.parse(cleaned);
    return suggestion;
  } catch {
    throw new Error(`Gemini response was not valid JSON:\n${rawText}`);
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // strip the data:...;base64, prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
