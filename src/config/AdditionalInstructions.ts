import fs from "fs/promises";
import path from "path";

export async function loadAdditionalInstructions(
  addPath?: string,
): Promise<string> {
  if (!addPath) return "";
  try {
    const resolved = path.isAbsolute(addPath) ? addPath : path.join(addPath);
    try {
      await fs.access(resolved);
    } catch (e) {
      console.warn("additionalInstructions file not found:", resolved);
      return "";
    }
    const content = await fs.readFile(resolved, "utf8");
    return content ?? "";
  } catch (e) {
    console.warn("Error loading additionalInstructions:", e);
    return "";
  }
}
