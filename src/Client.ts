import axios, { AxiosInstance } from "axios";
import { Logger } from "homebridge";

import { Sesame2Shadow } from "./types/API";

export class Client {
  private API_BASE_URL = "https://jhcr1i3ecb.execute-api.ap-northeast-1.amazonaws.com/prod";

  private instance: AxiosInstance = axios.create({
    baseURL: this.API_BASE_URL,
    headers: { "Content-Type": "application/json" },
  });

  constructor(private readonly log: Logger) {}

  async getShadow(uuid: string): Promise<Sesame2Shadow> {
    this.log.debug(`GET /device/sesame2/${uuid}`);

    const res = await this.instance.get(`/device/sesame2/${uuid}`);
    return res.data as Sesame2Shadow;
  }
}
