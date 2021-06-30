import {
  CognitoIdentityClient,
  Credentials,
  GetIdCommand,
  GetCredentialsForIdentityCommand,
} from "@aws-sdk/client-cognito-identity";
import { aws4Interceptor } from "aws4-axios";
import * as awsIot from "aws-iot-device-sdk";
import axios from "axios";
import { Logger } from "homebridge";
import { aesCmac } from "node-aes-cmac";
import { TextDecoder } from "util";

import { Sesame3 } from "./accessories/Sesame3";
import { SesameBot } from "./accessories/SesameBot";
import { Sesame2Shadow } from "./types/API";
import { Command } from "./types/Command";
import { CHDevice } from "./types/Device";

const APIGW_URL =
  "https://jhcr1i3ecb.execute-api.ap-northeast-1.amazonaws.com/prod";
const IOT_EP = "a3i4hui4gxwoo8-ats.iot.ap-northeast-1.amazonaws.com";

export class CognitoClient {
  readonly #device: CHDevice;
  readonly #deviceType: typeof Sesame3 | typeof SesameBot;
  readonly #apiKey: string;
  readonly #clientID: string;

  #credential: Credentials;
  #connection: awsIot.device | undefined = undefined;
  #updateCredentialTimer: NodeJS.Timer | undefined = undefined;

  constructor(
    deviceType: typeof Sesame3 | typeof SesameBot,
    device: CHDevice,
    apiKey: string,
    clientID: string,
    private readonly log: Logger,
  ) {
    this.#deviceType = deviceType;
    this.#device = device;
    this.#apiKey = apiKey;
    this.#clientID = clientID;

    this.#credential = {};
  }

  shutdown(): void {
    this.#connection?.end(true);
  }

  async getShadow(): Promise<Sesame2Shadow> {
    this.log.debug(`GET /things/sesame2/shadow?name=${this.#device.uuid}`);

    if (this.credentialExpired) {
      await this.authenticate();
    }

    const client = axios.create();
    const interceptor = aws4Interceptor(
      {
        region: "ap-northeast-1",
        service: "iotdata",
      },
      {
        accessKeyId: this.#credential.AccessKeyId!,
        secretAccessKey: this.#credential.SecretKey!,
        sessionToken: this.#credential.SessionToken!,
      },
    );
    client.interceptors.request.use(interceptor);
    const res = await client.get(
      `https://${IOT_EP}/things/sesame2/shadow?name=${this.#device.uuid}`,
    );

    const shadow = this.convertToSesame2Shadow(res.data.state.reported.mechst);
    this.log.debug(`${this.#device.uuid}:`, JSON.stringify(shadow));

    return shadow;
  }

  async subscribe(callback: (shadow: Sesame2Shadow) => void): Promise<void> {
    if (this.credentialExpired) {
      await this.authenticate();
    }

    // Set timer to update credential for mqtt reconnection.
    // Websocket connection will be closed after 24 hours based on aws iot quota.
    // see https://docs.aws.amazon.com/general/latest/gr/iot-core.html#iot-protocol-limits
    this.setUpdateCredentialTimer();

    this.#connection = new awsIot.device({
      host: IOT_EP,
      protocol: "wss",
      clean: false,
      clientId: this.#device.uuid,
      accessKeyId: this.#credential.AccessKeyId!,
      secretKey: this.#credential.SecretKey!,
      sessionToken: this.#credential.SessionToken!,
    });

    const decoder = new TextDecoder("utf8");
    this.#connection.on("message", (_, payload: ArrayBuffer) => {
      const data = decoder.decode(payload);
      if (typeof data === "undefined") {
        return;
      }

      const json = JSON.parse(data);
      const mechst = json.state.reported.mechst;
      if (typeof mechst !== "string") {
        return;
      }

      const shadow = this.convertToSesame2Shadow(mechst);
      this.log.debug(`${this.#device.uuid}:`, JSON.stringify(shadow));
      callback(shadow);
    });

    this.#connection.on("connect", () => {
      this.log.info(`${this.#device.uuid}: mqtt connection is established`);

      const topic = `$aws/things/sesame2/shadow/name/${
        this.#device.uuid
      }/update/accepted`;
      this.#connection?.subscribe(topic, { qos: 1 }, (err) => {
        if (!err) {
          this.log.debug(`${this.#device.uuid}: subscribed to ${topic}`);
        }
      });
    });

    this.#connection
      .on("error", (error) => {
        this.log.error(`${this.#device.uuid}: mqtt error:`, error);
      })
      .on("reconnect", async () => {
        this.log.info(`${this.#device.uuid}: mqtt connection will reconnect`);

        // Ensure to use not expired credential for mqtt reconnetion
        this.updateWebSocketCredentials();
      })
      .on("close", async () => {
        this.log.info(`${this.#device.uuid}: mqtt connection is closed`);
      });
  }

  async postCmd(cmd: Command, historyName?: string): Promise<boolean> {
    this.log.debug(`POST /device/v1/iot/sesame2/${this.#device.uuid}`);

    if (this.credentialExpired) {
      await this.authenticate();
    }

    const instance = axios.create({
      headers: { "x-api-key": this.#apiKey },
    });
    instance.interceptors.request.use(
      aws4Interceptor(
        {
          region: "ap-northeast-1",
          service: "execute-api",
        },
        {
          accessKeyId: this.#credential.AccessKeyId!,
          secretAccessKey: this.#credential.SecretKey!,
          sessionToken: this.#credential.SessionToken!,
        },
      ),
    );

    const url = `${APIGW_URL}/device/v1/iot/sesame2/${this.#device.uuid}`;
    const history = historyName ?? "Homebridge";
    const base64_history = Buffer.from(history).toString("base64");
    const sign = this.generateRandomTag(this.#device.secret).slice(0, 8);
    const res = await instance.post(url, {
      cmd: cmd,
      history: base64_history,
      sign: sign,
    });

    return res.status === 200;
  }

  private get credentialExpired(): boolean {
    const expireAt = this.#credential.Expiration?.getTime();
    if (expireAt == null) {
      return true;
    }
    return expireAt - 60 * 1000 < new Date().getTime();
  }

  private async authenticate(): Promise<void> {
    const region = this.#clientID.split(":")[0];
    const cognitoClient = new CognitoIdentityClient({ region: region });
    const command = new GetIdCommand({ IdentityPoolId: this.#clientID });

    const data = await cognitoClient.send(command);

    const credCommand = new GetCredentialsForIdentityCommand({
      IdentityId: data.IdentityId,
    });
    this.#credential = (await cognitoClient.send(credCommand)).Credentials!;
  }

  private setUpdateCredentialTimer(): void {
    if (this.#updateCredentialTimer) {
      clearTimeout(this.#updateCredentialTimer);
    }

    // Update credential 2.5 minutes before expire(proceeds 1 hour a day)
    const now = new Date().getTime();
    const expire =
      this.#credential.Expiration?.getTime() ?? now + 60 * 60 * 1000;
    const timeout = expire - now - 150 * 1000;

    // Update credential periodically
    this.#updateCredentialTimer = setTimeout(async () => {
      this.log.debug("Renew aws credential timer fired");
      await this.updateWebSocketCredentials(true);
      this.setUpdateCredentialTimer();
    }, timeout);
  }

  private async updateWebSocketCredentials(force = false): Promise<void> {
    if (
      force ||
      typeof this.#credential === "undefined" ||
      this.credentialExpired
    ) {
      await this.authenticate();
    }

    this.#connection?.updateWebSocketCredentials(
      this.#credential.AccessKeyId!,
      this.#credential.SecretKey!,
      this.#credential.SessionToken!,
      this.#credential.Expiration!,
    );
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

  private convertToSesame2Shadow(mechst: string): Sesame2Shadow {
    const data = Uint8Array.from(Buffer.from(mechst, "hex"));

    let voltages: Array<number>;
    let percentages: Array<number>;
    let voltage: number;
    let position: number;

    switch (this.#deviceType) {
      case SesameBot:
        voltages = [3.0, 2.9, 2.8, 2.8, 2.7, 2.6, 2.5, 2.5, 2.4, 2.3];
        percentages = [
          100.0, 50.0, 40.0, 32.0, 21.0, 13.0, 10.0, 7.0, 3.0, 0.0,
        ];
        voltage = (Buffer.from(data.slice(0, 2)).readUIntLE(0, 2) * 3.6) / 1023;
        position = 0;
        break;
      default:
        voltages = [6.0, 5.8, 5.7, 5.6, 5.4, 5.2, 5.1, 5.0, 4.8, 4.6];
        percentages = [
          100.0, 50.0, 40.0, 32.0, 21.0, 13.0, 10.0, 7.0, 3.0, 0.0,
        ];
        voltage = (Buffer.from(data.slice(0, 2)).readUIntLE(0, 2) * 7.2) / 1023;
        position = Buffer.from(data.slice(4, 6)).readUIntLE(0, 2);
        break;
    }

    let percentage =
      voltage > voltages[0] ? 100 : voltage < voltages.slice(-1)[0] ? 0 : -1;
    if (percentage === -1) {
      let i = 0;
      while (i < voltages.length - 1) {
        if (voltage > voltages[i] || voltage <= voltages[i + 1]) {
          i = i + 1;
          continue;
        } else {
          const f =
            (voltage - voltages[i + 1]) / (voltages[i] - voltages[i + 1]);
          const f3 = percentages[i];
          const f4 = percentages[i + 1];
          percentage = f4 + f * (f3 - f4);
          break;
        }
      }
    }

    let status: "locked" | "unlocked" | "moved";
    switch (true) {
      case (data[7] & 2) > 0:
        status = "locked";
        break;
      case (data[7] & 4) > 0:
        status = "unlocked";
        break;
      default:
        status = "moved";
        break;
    }

    return {
      batteryPercentage: percentage,
      batteryVoltage: voltage,
      position: position,
      CHSesame2Status: status,
    };
  }
}
