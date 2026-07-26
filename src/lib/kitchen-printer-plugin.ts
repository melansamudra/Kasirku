import { registerPlugin } from "@capacitor/core";

// Native bridge exposed by android-app/'s KitchenPrinterPlugin.kt. No-op safe
// to import from any browser context — Capacitor.isNativePlatform() is what
// callers check before actually calling these, and registerPlugin() itself
// never throws outside a native shell.
export interface KitchenPrinterPlugin {
  printLan(opts: {
    ip: string;
    port: number;
    bytesBase64: string;
    timeoutMs?: number;
  }): Promise<{ ok: boolean; error?: string }>;
  printBluetooth(opts: {
    address: string;
    bytesBase64: string;
    timeoutMs?: number;
  }): Promise<{ ok: boolean; error?: string }>;
  listPairedBluetoothDevices(): Promise<{ devices: { name: string; address: string }[] }>;
  isBluetoothEnabled(): Promise<{ enabled: boolean; supported: boolean }>;
}

export default registerPlugin<KitchenPrinterPlugin>("KitchenPrinter");
