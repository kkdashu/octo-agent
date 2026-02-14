import { createOpenRouter } from "@openrouter/ai-sdk-provider";
const OPENROUTER_API_KEY = process.env.AI_API_KEY;

const openrouter = createOpenRouter({
  apiKey: OPENROUTER_API_KEY
});

export function createModel(name: string) {
  const model = openrouter.chat(name);
  return model;
}
