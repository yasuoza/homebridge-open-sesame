import axios, { AxiosInstance } from "axios";
import { Logger } from "homebridge";
import { aesCmac } from "node-aes-cmac";

import { Client } from "./interfaces/Client";
import { Sesame2Shadow } from "./types/API";
import { Command } from "./types/Command";
import { SesameLock } from "./types/Device";

const API_BASE_URL = "https://app.candyhouse.co/api/sesame2";

export class CandyClient implements Client {
  #instance: AxiosInstance;

  constructor(apiKey: string, private readonly log: Logger) {
    this.#instance = axios.create({
      baseURL: API_BASE_URL,
      headers: { "x-api-key": apiKey },
    });
  }

  async getShadow(sesame: SesameLock): Promise<Sesame2Shadow> {
    this.log.debug(`GET /api/sesame2/${sesame.uuid}`);

    const res = await this.#instance.get(`/${sesame.uuid}`);
    return res.data as Sesame2Shadow;
  }

  async postCmd(
    sesame: SesameLock,
    cmd: Command,
    historyName?: string,
  ): Promise<boolean> {
    this.log.debug(`POST /api/sesame2/${sesame.uuid}/cmd`);

    const key_secret_hex = sesame.secret;
    const history = historyName ?? "Homebridge";
    const base64_history = Buffer.from(history).toString("base64");
    const sign = this.generateRandomTag(key_secret_hex);

    const res = await this.#instance.post(`/${sesame.uuid}/cmd`, {
      cmd: cmd,
      history: base64_history,
      sign: sign,
    });

    return res.status === 200;
  }

  async subscribe(
    sesame: SesameLock,
    interval: number | undefined,
    callback: (shadow: Sesame2Shadow) => void,
  ): Promise<void> {
    setInterval(async () => {
      const shadow = await this.getShadow(sesame);
      callback(shadow);
    }, interval);
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
