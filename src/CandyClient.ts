import axios, { AxiosInstance } from "axios";
import { Logger } from "homebridge";
import { aesCmac } from "node-aes-cmac";

import { Client } from "./interfaces/Client";
import { CHSesame2MechStatus } from "./types/API";
import { Command } from "./types/Command";
import { CHDevice } from "./types/Device";

const API_BASE_URL = "https://app.candyhouse.co/api/sesame2";

export class CandyClient implements Client {
  readonly #device: CHDevice;
  readonly #interval: number;
  #instance: AxiosInstance;

  constructor(
    device: CHDevice,
    apiKey: string,
    interval: number,
    private readonly log: Logger,
  ) {
    this.#device = device;
    this.#interval = interval;
    this.#instance = axios.create({
      baseURL: API_BASE_URL,
      headers: { "x-api-key": apiKey },
    });
  }

  shutdown(): void {
    // noop
  }

  async getMechStatus(): Promise<CHSesame2MechStatus | undefined> {
    this.log.debug(`GET /api/sesame2/${this.#device.uuid}`);

    const res = await this.#instance.get<CHSesame2MechStatus>(
      `/${this.#device.uuid}`,
    );
    res.data.isInLockRange = res.data.CHSesame2Status === "locked";
    res.data.isInUnlockRange = !res.data.isInLockRange;
    res.data.isBatteryCritical = res.data.batteryPercentage <= 30;

    this.log.debug(`${this.#device.uuid}:`, JSON.stringify(res.data));

    return res.data;
  }

  async postCmd(cmd: Command, historyName?: string): Promise<boolean> {
    this.log.debug(`POST /api/sesame2/${this.#device.uuid}/cmd`);

    const key_secret_hex = this.#device.secret;
    const history = historyName ?? "Homebridge";
    const base64_history = Buffer.from(history).toString("base64");
    const sign = this.generateRandomTag(key_secret_hex);

    const res = await this.#instance.post(`/${this.#device.uuid}/cmd`, {
      cmd: cmd,
      history: base64_history,
      sign: sign,
    });

    return res.status === 200;
  }

  async subscribe(
    callback: (status: CHSesame2MechStatus) => void,
  ): Promise<void> {
    setInterval(async () => {
      const status = await this.getMechStatus();
      if (typeof status === "undefined") {
        return;
      }
      callback(status);
    }, this.#interval);
  }

  // https://doc.candyhouse.co/ja/SesameAPI
  private generateRandomTag(secret: string): string {
    // * key:key-secret_hex to data
    const key = Buffer.from(secret, "hex");

    // message
    // 1. timestamp  (SECONDS SINCE JAN 01 1970. (UTC))  // 1621854456905
    // 2. timestamp to uint32  (little endian)   //f888ab60
    // 3. remove most-significant byte    //0x88ab60
    const date = Math.floor(Date.now() / 1000);
    const dateDate = Buffer.allocUnsafe(4);
    dateDate.writeUInt32LE(date);
    const message = Buffer.from(dateDate.slice(1, 4));

    return aesCmac(key, message);
  }
}
