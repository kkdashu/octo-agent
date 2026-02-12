import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, type LanguageModelUsage, type ModelMessage } from "ai";
import { createBashTool } from "./tools/bash.js";
import * as readline from 'node:readline/promises';

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});


const OPENROUTER_API_KEY = process.env.AI_API_KEY;

async function main() {
  const openrouter = createOpenRouter({
    apiKey: OPENROUTER_API_KEY
  });

  const workdir = process.cwd();
  console.log(workdir);
  const bash = createBashTool(workdir);

  const model = openrouter.chat('google/gemini-3-flash-preview');
  const messages: ModelMessage[] = [];
  // const usages: LanguageModelUsage[] = [];

  const runTurns = async () => {
    let step = 0;
    const maxStep = 10;
    while (step < maxStep) {
      const res = streamText({
        model,
        tools: {bash},
        messages
      });
      process.stdout.write('\nAssistant: ');
      for await (const chunk of res.textStream) {
        process.stdout.write(chunk);
      }
      const text = await res.text
      process.stdout.write('\n\n');
      const response = await res.response;
      messages.push(...response.messages);
      if (text) {
        break;
      }
      step++;
    }
  }

  while (true) {
    const userInput = await terminal.question('You: ');
    if (userInput == 'quit') {
      terminal.close();
      break;
    }
    messages.push({role: 'user', content: userInput});
    try {
      await runTurns();
    } finally {
    }
  }
}

main();
