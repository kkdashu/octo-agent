import { tool, type TextPart } from "ai";
import { z } from "zod"
import { access as fsAccess, readFile as fsReadFile, writeFile as fsWriteFile, mkdir as fsMkdir } from "fs/promises";
import { constants } from "fs";
import * as pathMod from "path";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead, type TruncationResult } from "./utils/truncate";
import { resolveReadPath } from "./utils/path-utils";
import { detectSupportedImageMimeTypeFromFile } from "./utils/mime";
import { formatDimensionNote, resizeImage, type ImagePart } from "./utils/resize-image";


/**
 * Pluggable operations for the read tool.
 * Override these to delegate file reading to remote systems (e.g., SSH).
 */
export interface ReadOperations {
	/** Read file contents as a Buffer */
	readFile: (absolutePath: string) => Promise<Buffer>;
	/** Check if file is readable (throw if not) */
	access: (absolutePath: string) => Promise<void>;
	/** Detect image MIME type, return null/undefined for non-images */
	detectImageMimeType?: (absolutePath: string) => Promise<string | null | undefined>;
}

const defaultReadOperations: ReadOperations = {
	readFile: (path) => fsReadFile(path),
	access: (path) => fsAccess(path, constants.R_OK),
	detectImageMimeType: detectSupportedImageMimeTypeFromFile,
};

export interface ReadToolDetails {
	truncation?: TruncationResult;
}

export function createReadTool(cwd: string) {
	return tool({
		description: `Read the contents of a file. Supports text files and images (jpg, png, gif, webp). Images are sent as attachments. For text files, output is truncated to ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete.`,
		inputSchema: z.object({
			path: z.string().describe('Path to the file to read (relative or absolute)'),
			offset: z.number().optional().describe('Line number to start reading from (1-indexed)'),
			limit: z.number().optional().describe('Maximum number of lines to read')
		}),
		execute: async ({ path, offset, limit }) => {
			const absolutePath = resolveReadPath(path, cwd);
			const ops = defaultReadOperations;
			const autoResizeImages = true;

			return new Promise<(TextPart | ImagePart)[]>(
				(resolve, reject) => {

					console.log('absolutePath: ', absolutePath);

					let aborted = false;

					// Set up abort handler
					// const onAbort = () => {
					// 	aborted = true;
					// 	reject(new Error("Operation aborted"));
					// };

					// Perform the read operation
					(async () => {
						try {
							// Check if file exists
							await ops.access(absolutePath);

							// Check if aborted before reading
							if (aborted) {
								return;
							}

							const mimeType = ops.detectImageMimeType ? await ops.detectImageMimeType(absolutePath) : undefined;
							console.log('mimeType: ', mimeType);

							// Read the file based on type
							let content: (TextPart | ImagePart)[];

							if (mimeType) {
								// Read as image (binary)
								const buffer = await ops.readFile(absolutePath);
								console.log('buffer: ', buffer);
								const base64 = buffer.toString("base64");

								if (autoResizeImages) {
									// Resize image if needed
									const resized = await resizeImage({type: 'image', image: base64, mimeType });

									// Debug: Save resized image to .octo-run/assets/
									try {
										const assetsDir = pathMod.join(cwd, '.octo-run', 'assets');
										await fsMkdir(assetsDir, { recursive: true });
										const filename = pathMod.basename(absolutePath);
										const debugPath = pathMod.join(assetsDir, `debug_${filename}`);
										await fsWriteFile(debugPath, Buffer.from(resized.data, 'base64'));
										console.log(`[ReadTool] Saved debug image to ${debugPath}`);
									} catch (error) {
										console.error('[ReadTool] Failed to save debug image:', error);
									}

									const dimensionNote = formatDimensionNote(resized);

									let textNote = `Read image file [${resized.mimeType}]`;
									if (dimensionNote) {
										textNote += `\n${dimensionNote}`;
									}

									content = [
										{ type: "text", text: textNote },
										{ type: "image", image: resized.data, mimeType: resized.mimeType },
									];
								} else {
									const textNote = `Read image file [${mimeType}]`;
									content = [
										{ type: "text", text: textNote },
										{ type: "image", image: base64, mimeType: mimeType },
									];
								}
							} else {
								// Read as text
								const buffer = await ops.readFile(absolutePath);
								const textContent = buffer.toString("utf-8");
								const allLines = textContent.split("\n");
								const totalFileLines = allLines.length;

								// Apply offset if specified (1-indexed to 0-indexed)
								const startLine = offset ? Math.max(0, offset - 1) : 0;
								const startLineDisplay = startLine + 1; // For display (1-indexed)

								// Check if offset is out of bounds
								if (startLine >= allLines.length) {
									throw new Error(`Offset ${offset} is beyond end of file (${allLines.length} lines total)`);
								}

								// If limit is specified by user, use it; otherwise we'll let truncateHead decide
								let selectedContent: string;
								let userLimitedLines: number | undefined;
								if (limit !== undefined) {
									const endLine = Math.min(startLine + limit, allLines.length);
									selectedContent = allLines.slice(startLine, endLine).join("\n");
									userLimitedLines = endLine - startLine;
								} else {
									selectedContent = allLines.slice(startLine).join("\n");
								}

								// Apply truncation (respects both line and byte limits)
								const truncation = truncateHead(selectedContent);

								let outputText: string;

								if (truncation.firstLineExceedsLimit) {
									// First line at offset exceeds 30KB - tell model to use bash
									const firstLineSize = formatSize(Buffer.byteLength(allLines[startLine]!, "utf-8"));
									outputText = `[Line ${startLineDisplay} is ${firstLineSize}, exceeds ${formatSize(DEFAULT_MAX_BYTES)} limit. Use bash: sed -n '${startLineDisplay}p' ${path} | head -c ${DEFAULT_MAX_BYTES}]`;
								} else if (truncation.truncated) {
									// Truncation occurred - build actionable notice
									const endLineDisplay = startLineDisplay + truncation.outputLines - 1;
									const nextOffset = endLineDisplay + 1;

									outputText = truncation.content;

									if (truncation.truncatedBy === "lines") {
										outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines}. Use offset=${nextOffset} to continue.]`;
									} else {
										outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Use offset=${nextOffset} to continue.]`;
									}
								} else if (userLimitedLines !== undefined && startLine + userLimitedLines < allLines.length) {
									// User specified limit, there's more content, but no truncation
									const remaining = allLines.length - (startLine + userLimitedLines);
									const nextOffset = startLine + userLimitedLines + 1;

									outputText = truncation.content;
									outputText += `\n\n[${remaining} more lines in file. Use offset=${nextOffset} to continue.]`;
								} else {
									// No truncation, no user limit exceeded
									outputText = truncation.content;
								}

								content = [{ type: "text", text: outputText }];
							}

							// Check if aborted after reading
							if (aborted) {
								return;
							}

							// Clean up abort handler
							// if (signal) {
							// 	signal.removeEventListener("abort", onAbort);
							// }

							resolve(content);
						} catch (error: any) {
							// Clean up abort handler
							// if (signal) {
							// 	signal.removeEventListener("abort", onAbort);
							// }

							if (!aborted) {
								reject(error);
							}
						}
					})();
				},
			);
		}
	});
}
