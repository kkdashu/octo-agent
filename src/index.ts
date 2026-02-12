import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, type LanguageModelUsage, type ModelMessage } from "ai";
import { createBashTool } from "bash-tool";
import { Bash } from "just-bash";


const OPENROUTER_API_KEY = process.env.AI_API_KEY;

async function main() {
  const openrouter = createOpenRouter({
    apiKey: OPENROUTER_API_KEY
  });

  const sandbox = new Bash({ cwd: process.cwd() });
  const { tools } = await createBashTool({
    sandbox,
    uploadDirectory: { source: process.cwd(), include: "**/*.{ts,json}" },
    destination: process.cwd()
  });

  const model = openrouter.chat('google/gemini-3-flash-preview');
  const messages: ModelMessage[] = [{
    role: 'user',
    content: '当前目录是什么，里面有哪些文件？'
  }]
  let step = 0;
  const maxSteps = 10;
  const usages: LanguageModelUsage[] = [];
  while (step < maxSteps) {
    const res = await generateText({
      model,
      tools,
      messages
    });
    messages.push(...res.response.messages);
    console.log(messages);
    usages.push(res.usage);
    console.log('finishReason: ', res.finishReason);
    if (res.text) {
      console.log(res.text);
      break;
    }
    step++
  }
  console.log(usages);
}

main();
