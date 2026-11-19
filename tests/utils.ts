import { ensureStorage } from "@/lib/storage";

export async function initializeStorage(): Promise<void> {
  await ensureStorage();
}
