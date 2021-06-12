import axios, { AxiosInstance } from "axios";
import { Logger } from "homebridge";
import { aesCmac } from "node-aes-cmac";

import { Sesame2Shadow } from "./types/API";

const API_BASE_URL = "https://app.candyhouse.co/api/sesame2";

export const Command = {
  lock: 82,
  unlock: 83,
};
type Command = typeof Command[keyof typeof Command];

export class Client {
  #instance: AxiosInstance;

  constructor(apiKey: string, private readonly log: Logger) {
    this.#instance = axios.create({
      baseURL: API_BASE_URL,
      headers: { "x-api-key": apiKey },
    });
  }

  async getShadow(uuid: string): Promise<Sesame2Shadow> {
    this.log.debug(`GET /api/sesame2/${uuid}`);

    const res = await this.#instance.get(`/${uuid}`);
    return res.data as Sesame2Shadow;
  }

  async postCmd(uuid: string, cmd: Command): Promise<boolean> {
    this.log.debug(`POST /api/sesame2/${uuid}/cmd`);

    const key_secret_hex = "a13d4b890111676ba8fb36ece7e94f7d";
    const base64_history = Buffer.from("homebridge-open-sesame").toString(
      "base64",
    );
    const sign = this.generateRandomTag(key_secret_hex);

    const res = await this.#instance.post(`/${uuid}/cmd`, {
      cmd: cmd,
      history: base64_history,
      sign: sign,
    });

    return res.status === 200;
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
