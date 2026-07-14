import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

interface PreloadSteamApi {
  setCloudSave(slot: string, data: string): Promise<void>;
  getCloudSave(slot: string): Promise<string | null>;
}

interface ExposedElectronApi {
  steam: PreloadSteamApi;
  dialog: {
    saveFile(data: string, filename: string): Promise<boolean>;
    openFile(): Promise<string | null>;
  };
}

type IpcInvoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

function executePreload(invoke: IpcInvoke): ExposedElectronApi {
  const source = readFileSync(resolve(process.cwd(), "electron/preload.js"), "utf8");
  let exposed: unknown;
  const contextBridge = {
    exposeInMainWorld: (_name: string, value: unknown) => {
      exposed = value;
    },
  };
  runInNewContext(source, {
    Buffer,
    Uint8Array,
    console,
    require: (moduleName: string) => {
      if (moduleName !== "electron") throw new Error(`Unexpected module: ${moduleName}`);
      return { contextBridge, ipcRenderer: { invoke } };
    },
  });
  if (!exposed || typeof exposed !== "object") {
    throw new Error("The preload did not expose electronAPI");
  }
  return exposed as ExposedElectronApi;
}

describe("sandboxed preload save transfer", () => {
  it("chunks upload and download IPC while preserving the exact UTF-8 save", async () => {
    const chunks: Buffer[] = [];
    let cloudPayload: Buffer | null = null;
    const invoke = vi.fn<IpcInvoke>(async (channel, ...args) => {
      switch (channel) {
        case "steam:beginCloudSaveTransfer":
          expect(args[0]).toBe("2");
          expect(args[2]).toBe(3);
          return "upload-1";
        case "steam:appendCloudSaveChunk":
          expect(args[0]).toBe("upload-1");
          expect(args[1]).toBe(chunks.length);
          chunks.push(Buffer.from(args[2] as Uint8Array));
          return chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
        case "steam:commitCloudSaveTransfer":
          cloudPayload = Buffer.concat(chunks);
          return undefined;
        case "steam:abortCloudSaveTransfer":
          return true;
        case "steam:beginCloudLoadTransfer": {
          if (!cloudPayload) return null;
          return {
            transferId: "download-1",
            totalBytes: cloudPayload.byteLength,
            chunkCount: Math.ceil(cloudPayload.byteLength / (1024 * 1024)),
          };
        }
        case "steam:readCloudLoadChunk": {
          if (!cloudPayload) throw new Error("missing cloud payload");
          const index = args[1] as number;
          const start = index * 1024 * 1024;
          return cloudPayload.subarray(
            start,
            Math.min(start + 1024 * 1024, cloudPayload.byteLength),
          );
        }
        case "steam:finishCloudLoadTransfer":
          return true;
        default:
          throw new Error(`Unexpected IPC channel: ${channel}`);
      }
    });
    const api = executePreload(invoke);
    const save = JSON.stringify({
      scout: "Marta Sørensen",
      state: "z".repeat(2 * 1024 * 1024 + 400_000),
    });

    await api.steam.setCloudSave("2", save);
    await expect(api.steam.getCloudSave("2")).resolves.toBe(save);
    expect(chunks).toHaveLength(3);
    expect(
      invoke.mock.calls.filter(([channel]) => channel === "steam:appendCloudSaveChunk"),
    ).toHaveLength(3);
  });

  it("rejects impossible download metadata and explicitly releases the transfer", async () => {
    const invoke = vi.fn<IpcInvoke>(async (channel) => {
      if (channel === "steam:beginCloudLoadTransfer") {
        return {
          transferId: "oversized-download",
          totalBytes: 96 * 1024 * 1024 + 1,
          chunkCount: 97,
        };
      }
      if (channel === "steam:finishCloudLoadTransfer") return true;
      throw new Error(`Unexpected IPC channel: ${channel}`);
    });
    const api = executePreload(invoke);

    await expect(api.steam.getCloudSave("1")).rejects.toThrow(/invalid byte length/);
    expect(invoke).toHaveBeenCalledWith(
      "steam:finishCloudLoadTransfer",
      "oversized-download",
    );
  });

  it("chunks native export and import while preserving cancellation", async () => {
    const chunks: Buffer[] = [];
    let exported: Buffer | null = null;
    const invoke = vi.fn<IpcInvoke>(async (channel, ...args) => {
      switch (channel) {
        case "dialog:beginSaveFileTransfer":
          expect(args[0]).toBe("career.json");
          return "dialog-upload";
        case "dialog:appendSaveFileChunk":
          chunks.push(Buffer.from(args[2] as Uint8Array));
          return chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
        case "dialog:commitSaveFileTransfer":
          exported = Buffer.concat(chunks);
          return true;
        case "dialog:abortSaveFileTransfer":
          return true;
        case "dialog:beginOpenFileTransfer":
          if (!exported) return null;
          return {
            transferId: "dialog-download",
            totalBytes: exported.byteLength,
            chunkCount: Math.ceil(exported.byteLength / (1024 * 1024)),
          };
        case "dialog:readOpenFileChunk": {
          if (!exported) throw new Error("missing export");
          const index = args[1] as number;
          const start = index * 1024 * 1024;
          return exported.subarray(
            start,
            Math.min(start + 1024 * 1024, exported.byteLength),
          );
        }
        case "dialog:finishOpenFileTransfer":
          return true;
        default:
          throw new Error(`Unexpected IPC channel: ${channel}`);
      }
    });
    const api = executePreload(invoke);
    const save = JSON.stringify({
      scout: "Renée",
      history: "h".repeat(1024 * 1024 + 250_000),
    });

    await expect(api.dialog.saveFile(save, "career.json")).resolves.toBe(true);
    await expect(api.dialog.openFile()).resolves.toBe(save);
    expect(chunks).toHaveLength(2);

    invoke.mockImplementationOnce(async (channel) => {
      expect(channel).toBe("dialog:beginSaveFileTransfer");
      return null;
    });
    await expect(api.dialog.saveFile("{}", "cancel.json")).resolves.toBe(false);
  });
});
