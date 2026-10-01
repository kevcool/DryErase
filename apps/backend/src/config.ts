import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(currentDir, "../../..");

loadEnv({ path: path.join(workspaceRoot, ".env.local") });
loadEnv();

const envSchema = z.object({
  DRYERASE_API_HOST: z.string().default("127.0.0.1"),
  DRYERASE_API_PORT: z.coerce.number().int().positive().default(5050),
  DRYERASE_CORS_ORIGIN: z.string().default("http://localhost:5173"),
  DRYERASE_BOARD_STORE_PATH: z.string().default(path.join(workspaceRoot, "data/boards.json")),
  DRYERASE_ASSET_STORE_PATH: z.string().default(path.join(workspaceRoot, "data/assets"))
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  DRYERASE_BOARD_STORE_PATH: path.isAbsolute(parsedEnv.DRYERASE_BOARD_STORE_PATH)
    ? parsedEnv.DRYERASE_BOARD_STORE_PATH
    : path.resolve(workspaceRoot, parsedEnv.DRYERASE_BOARD_STORE_PATH),
  DRYERASE_ASSET_STORE_PATH: path.isAbsolute(parsedEnv.DRYERASE_ASSET_STORE_PATH)
    ? parsedEnv.DRYERASE_ASSET_STORE_PATH
    : path.resolve(workspaceRoot, parsedEnv.DRYERASE_ASSET_STORE_PATH)
};
