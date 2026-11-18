import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_NAME = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Add it in Settings > Secrets.',
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface InventoryContextProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  supplier: string;
  purchasePrice: number;
  sellingPrice: number;
  quantity: number;
  minStock: number;
  unit: string;
  movementsLast30Days: number;
  inboundLast30Days: number;
  outboundLast30Days: number;
  lastMovementAt: string | null;
}

interface InventoryContextPayload {
  summary: {
    totalProducts: number;
    totalRetailValue: number;
    totalCostValue: number;
    lowStockCount: number;
    outOfStockCount: number;
    movementsLast30DaysCount: number;
    noMovement30DaysCount: number;
  };
  products: InventoryContextProduct[];
  recentTransactions: Array<{
    productName: string;
    sku: string;
    type: string;
    quantity: number;
    resultingStock: number;
    reason: string;
    createdAt: string | null;
  }>;
}

interface ChatHistoryItem {
  role: 'user' | 'assistant';
  text: string;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Grounded AI Inventory Assistant Chat
  app.post('/api/ai/chat', async (req: Request, res: Response) => {
    try {
      const { messages, inventoryContext } = req.body as {
        messages?: ChatHistoryItem[];
        inventoryContext?: InventoryContextPayload;
      };

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Messages array is required.' });
        return;
      }
      if (!inventoryContext || !Array.isArray(inventoryContext.products)) {
        res.status(400).json({ error: 'Inventory database context is required.' });
        return;
      }

      const ai = getGeminiClient();

      const systemInstruction = [
        'You are the SmartStock AI Inventory Assistant.',
        'You answer questions strictly using the live database snapshot provided in the JSON context below.',
        'Rules:',
        '1. Base every number, product name, SKU, stock count, supplier, and movement stat ONLY on the provided JSON context.',
        '2. Never invent, estimate, or guess products, prices, sales, suppliers, or dates that are not in the data.',
        '3. If the provided database context does not contain enough information to answer the user question, clearly state that the data is not available in the current inventory records.',
        '4. Keep answers clear, concise, and practical for store operations. Use bullet points or short tables when listing multiple SKUs.',
        '5. Always cite exact SKUs and unit counts when referencing products.',
        '',
        'LIVE DATABASE CONTEXT (Firestore snapshot):',
        JSON.stringify(inventoryContext),
      ].join('\n');

      const contents = messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }],
      }));

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents,
        config: {
          systemInstruction,
        },
      });

      const reply = (response.text ?? '').trim();
      if (!reply) {
        res.status(502).json({ error: 'Gemini returned an empty response.' });
        return;
      }

      res.json({ reply });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to generate AI assistant response.';
      const status = message.includes('GEMINI_API_KEY') ? 503 : 500;
      res.status(status).json({ error: message });
    }
  });

  // Dashboard Restocking Suggestions (Structured JSON from real DB data)
  app.post('/api/ai/restock-suggestions', async (req: Request, res: Response) => {
    try {
      const { products } = req.body as {
        products?: InventoryContextProduct[];
      };

      if (!Array.isArray(products)) {
        res.status(400).json({ error: 'Products array is required.' });
        return;
      }

      const candidates = products.filter((p) => p.quantity <= p.minStock);
      if (candidates.length === 0) {
        res.json({ suggestions: [] });
        return;
      }

      const ai = getGeminiClient();

      const prompt = [
        'Analyze these products that are at or below their minimum stock threshold.',
        'For each product (up to 4 highest-priority items, prioritizing out-of-stock items first), return:',
        '- productId: exact id from input',
        '- productName: exact name from input',
        '- sku: exact sku from input',
        '- currentStock: exact quantity from input',
        '- minStock: exact minStock from input',
        '- suggestedQuantity: positive integer reorder quantity based on minStock deficit and outboundLast30Days',
        '- urgency: "critical" if currentStock == 0, else "low"',
        '- reason: a crisp one-line reason (max 18 words) grounded strictly in currentStock, minStock, and 30-day outbound movement.',
        '',
        'PRODUCTS DATA:',
        JSON.stringify(candidates),
      ].join('\n');

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          systemInstruction:
            'You are an inventory replenishment analyst. Only reference exact values from the provided JSON. Do not invent numbers.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                productId: { type: Type.STRING },
                productName: { type: Type.STRING },
                sku: { type: Type.STRING },
                currentStock: { type: Type.INTEGER },
                minStock: { type: Type.INTEGER },
                suggestedQuantity: { type: Type.INTEGER },
                urgency: { type: Type.STRING },
                reason: { type: Type.STRING },
              },
              required: [
                'productId',
                'productName',
                'sku',
                'currentStock',
                'minStock',
                'suggestedQuantity',
                'urgency',
                'reason',
              ],
            },
          },
        },
      });

      const raw = (response.text ?? '[]').trim();
      const suggestions = JSON.parse(raw);
      res.json({ suggestions });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to generate restocking suggestions.';
      const status = message.includes('GEMINI_API_KEY') ? 503 : 500;
      res.status(status).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SmartStock AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
