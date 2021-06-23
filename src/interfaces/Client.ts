import { Sesame2Shadow } from "../types/API";
import { Command } from "../types/Command";

export interface Client {
  getShadow(): Promise<Sesame2Shadow>;

  postCmd(cmd: Command, historyName?: string): Promise<boolean>;

  subscribe(callback: (shadow: Sesame2Shadow) => void): Promise<void>;
}
