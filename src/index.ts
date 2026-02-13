import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, type ModelMessage } from "ai";
import { createBashTool } from "./tools/bash.js";
import * as readline from 'node:readline/promises';
import { createReadTool } from "./tools/read.js";
import util from 'util';
import { splitMultipartToolResults } from "./utils/split-multipart-tool-results.js";

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
  const read = createReadTool(workdir);

  const model = openrouter.chat('google/gemini-3-flash-preview');
  const messages: ModelMessage[] = [];
  // const usages: LanguageModelUsage[] = [];

  const runTurns = async () => {
    let step = 0;
    const maxStep = 10;
    while (step < maxStep) {
      const res = streamText({
        model,
        tools: {bash, read},
        onStepFinish: (opts) => {
          console.log(`step: ${step}`);
          console.log('text: ', opts.text);
          console.log('toolCalls: ', util.inspect(opts.toolCalls, {showHidden: false, depth: null, colors: true}));
          console.log('toolResults: ', util.inspect(opts.toolResults, {showHidden: false, depth: null, colors: true}));
          console.log('finishReason: ', opts.finishReason);
        },
        messages
      });
      process.stdout.write('\nAssistant: ');
      for await (const chunk of res.textStream) {
        process.stdout.write(chunk);
      }
      const text = await res.text
      process.stdout.write('\n\n');
      const response = await res.response;
      // ai-sdk 的 openrouter provider 有bug，不能识别工具返回的图片
      // 先hack一下，把工具返回的图片转成用户消息
      // https://github.com/OpenRouterTeam/ai-sdk-provider/issues/181
      const newMessages = splitMultipartToolResults({messages: response.messages});
      console.log('response: ', util.inspect(newMessages, {showHidden: false, depth: null, colors: true}));
      messages.push(...newMessages);
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
