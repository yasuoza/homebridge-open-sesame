import Fastify, { FastifyInstance } from "fastify";

import { Sesame3 } from "./accessories/Sesame3";

type WebhookRequest = {
  uuid: string;
  CHSesame2Status: string;
};

export class Server {
  public readonly locks = new Map<string, Sesame3>();

  private readonly api: FastifyInstance = Fastify({});
  private readonly port: number;

  constructor(port: number) {
    this.port = port;

    this.api = this.api.post<{ Body: WebhookRequest }>(
      "/",
      async (request, reply) => {
        reply.type("application/json").code(200);
        this.handleRequest(request.body);
        reply.send();
      },
    );
  }

  async listen(): Promise<void> {
    await this.api.listen(this.port, "0.0.0.0");
  }

  handleRequest(data: WebhookRequest): void {
    const uuid = data.uuid.toUpperCase();
    const status = data.CHSesame2Status;

    if (uuid == null || status == null) {
      return;
    }

    const sesame = this.locks.get(uuid);
    sesame?.setLockStatus(status);
  }
}
