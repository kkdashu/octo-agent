import { streamText } from "ai";
import * as path from "path";
import * as fs from 'fs/promises';
import { createModel } from "../src/provider/nim";

const model = createModel('z-ai/glm4.7');

async function main() {
  const imagePath = path.join(process.cwd(), '.octo-run', 'assets', 'debug_calendar_view.png');
  console.log(imagePath);
  const buffer = await fs.readFile(imagePath);
  const base64 = buffer.toString("base64");
  console.log(base64);
  const res = streamText({
    model,
    messages: [{
      role: 'user',
      content: [{
        type: "text",
        text: "帮我分析下面图片",
      }]
    }, {
      role: 'assistant',
      content: [{
        type: 'tool-call',
        toolCallId: 'tool_read_rPhRr',
        toolName: 'read',
        input: {path: 'screenshot.png'}
      }]
    }, {
      role: 'tool',
      content: [
        {
          type: 'tool-result', toolCallId: 'tool_read_rPhRr', toolName: 'read', output: {
            type: 'content',
            value: [{
              type: 'media',
              data: base64,
              mediaType: 'image/jpeg'
            }]
          }
        }
      ]
    }],
  });
  for await (const chunk of res.textStream) {
    console.log(chunk);
  }
}

main();
