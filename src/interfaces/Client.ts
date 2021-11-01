import { CHSesame2MechStatus } from "../types/API";
import { Command } from "../types/Command";

export interface Client {
  shutdown(): void;

  getMechStatus(): Promise<CHSesame2MechStatus | undefined>;

  postCmd(cmd: Command, historyName?: string): Promise<boolean>;

  subscribe(callback: (status: CHSesame2MechStatus) => void): Promise<void>;
}
