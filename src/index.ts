import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { stepCountIs, ToolLoopAgent } from "ai";
import { createBashTool } from "bash-tool";
import { Bash } from "just-bash";


const OPENROUTER_API_KEY = process.env.AI_API_KEY;

async function main() {
  const openrouter = createOpenRouter({
    apiKey: OPENROUTER_API_KEY
  });

  const sandbox = new Bash({cwd: process.cwd()});
  const { tools } = await createBashTool({
    sandbox,
    uploadDirectory: {source: process.cwd(), include: "**/*.{ts,json}"},
    destination: process.cwd()
  });

  const model = openrouter.chat('google/gemini-3-flash-preview');
  const agent = new ToolLoopAgent({
    model,
    tools,
    stopWhen: stepCountIs(10)
  });
  const result = await agent.generate({
    prompt: "当前目录是什么，里面有哪些文件？"
  });
  console.log('usage: ', result.usage);
  console.log('toolCalls: ', result.toolCalls,);
  console.log(result.text);
}

main();
