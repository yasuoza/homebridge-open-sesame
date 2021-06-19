import { Sesame2Shadow } from "../types/API";
import { Command } from "../types/Command";
import { SesameLock } from "../types/Device";

export interface Client {
  getShadow(sesame: SesameLock): Promise<Sesame2Shadow>;

  postCmd(
    sesame: SesameLock,
    cmd: Command,
    historyName?: string,
  ): Promise<boolean>;

  subscribe(
    sesame: SesameLock,
    interval: number,
    callback: (shadow: Sesame2Shadow) => void,
  ): Promise<void>;
}
