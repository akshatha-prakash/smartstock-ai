import { Product, RestockSuggestion, StockTransaction } from '../types/inventory';
import { buildInventoryContext } from '../utils/analytics';

export async function askInventoryAssistant(
  messages: Array<{ role: 'user' | 'assistant'; text: string }>,
  products: Product[],
  transactions: StockTransaction[],
): Promise<string> {
  const inventoryContext = buildInventoryContext(products, transactions);

  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, inventoryContext }),
  });

  const data = (await response.json()) as { reply?: string; error?: string };
  if (!response.ok) {
    throw new Error(data.error || 'Unable to reach AI Assistant.');
  }
  return data.reply || 'No response received.';
}

export async function fetchRestockSuggestions(
  products: Product[],
  transactions: StockTransaction[],
): Promise<RestockSuggestion[]> {
  const context = buildInventoryContext(products, transactions);
  const candidates = context.products.filter((p) => p.quantity <= p.minStock);

  if (candidates.length === 0) {
    return [];
  }

  const response = await fetch('/api/ai/restock-suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ products: candidates }),
  });

  const data = (await response.json()) as {
    suggestions?: RestockSuggestion[];
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error || 'Unable to load AI restocking suggestions.');
  }
  return Array.isArray(data.suggestions) ? data.suggestions : [];
}
