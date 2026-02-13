import { createReadTool } from "./src/tools/read.js";
import * as path from "path";

async function verify() {
    const workdir = process.cwd();
    const read = createReadTool(workdir);

    // Test with an image
    const imagePath = "screenshot.png";
    console.log(`Testing read tool with: ${imagePath}`);

    try {
        const result = await read.execute({ path: imagePath }, {} as any);
        console.log("Result type:", Array.isArray(result) ? "Array" : typeof result);
        console.log("Result content:", JSON.stringify(result, null, 2).substring(0, 500) + "...");

        if (!Array.isArray(result)) {
            throw new Error("Result should be an array of parts");
        }

        const imagePart = result.find(p => p.type === "image");
        if (!imagePart) {
            throw new Error("Image part not found in result");
        }

        if (!("mimeType" in imagePart)) {
            throw new Error("Image part missing 'mimeType' property");
        }

        console.log("\nVERIFICATION SUCCESSFUL: Tool returns flattened array with correct mimeType property.");
    } catch (error) {
        console.error("\nVERIFICATION FAILED:", error);
        process.exit(1);
    }
}

verify();
