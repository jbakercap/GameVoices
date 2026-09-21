/**
 * Google AI (Gemini) helper for Supabase Edge Functions.
 * Replaces the Lovable AI gateway with direct Google AI API calls.
 *
 * Usage:
 *   import { chatCompletion } from '../_shared/google-ai.ts';
 *   const result = await chatCompletion({ messages, model, temperature });
 */

const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY') || '';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: string };
}

interface GeminiContent {
  role: string;
  parts: { text: string }[];
}

/**
 * Call Google AI's Gemini API with an OpenAI-style messages array.
 * Returns the text content of the first candidate.
 */
export async function chatCompletion(options: ChatCompletionOptions): Promise<string> {
  const {
    messages,
    model = 'gemini-2.5-flash-lite',
    temperature = 0.3,
    max_tokens,
  } = options;

  if (!GOOGLE_AI_API_KEY) {
    throw new Error('GOOGLE_AI_API_KEY is not set');
  }

  // Convert OpenAI-style messages to Gemini format
  // Gemini uses systemInstruction for system messages, and contents for user/model turns
  let systemInstruction: { parts: { text: string }[] } | undefined;
  const contents: GeminiContent[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Merge multiple system messages
      if (!systemInstruction) {
        systemInstruction = { parts: [{ text: msg.content }] };
      } else {
        systemInstruction.parts.push({ text: msg.content });
      }
    } else {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
  }

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature,
      ...(max_tokens ? { maxOutputTokens: max_tokens } : {}),
      responseMimeType: options.response_format?.type === 'json_object'
        ? 'application/json'
        : 'text/plain',
    },
  };

  if (systemInstruction) {
    body.systemInstruction = systemInstruction;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_AI_API_KEY}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Google AI API error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(`Google AI returned no content: ${JSON.stringify(data)}`);
  }

  return text;
}
