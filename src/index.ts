import { streamText, type ModelMessage } from "ai";
import { createBashTool } from "./tools/bash.js";
import * as readline from 'node:readline/promises';
import { createReadTool } from "./tools/read.js";
import util from 'util';
import { splitMultipartToolResults } from "./utils/split-multipart-tool-results.js";
import { createModel } from "./provider/nim.js";
// import { createModel } from "./provider/openrouter.js";

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});


async function main() {

  const workdir = process.cwd();
  console.log(workdir);
  const bash = createBashTool(workdir);
  const read = createReadTool(workdir);

  // const model = createModel('google/gemini-3-flash-preview');
  const model = createModel('z-ai/glm4.7');

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
        messages,
        onError: (err) => {
          console.error(err);
        }
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
      console.log('text', text);
      const finishReason = await res.finishReason;
      if (finishReason == 'stop' || finishReason == 'error') {
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
