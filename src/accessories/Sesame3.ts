import { Mutex } from "async-mutex";
import { Service, PlatformAccessory, CharacteristicValue } from "homebridge";

import { CandyClient } from "../CandyClient";
import { CognitoClient } from "../CognitoClient";
import { Client } from "../interfaces/Client";
import { OpenSesame } from "../platform";
import { PLATFORM_NAME } from "../settings";
import { Sesame2Shadow } from "../types/API";
import { Command } from "../types/Command";
import { SesameLock } from "../types/Device";
import { sleep } from "../util";

export class Sesame3 {
  #client: Client;
  #mutex: Mutex;

  #lockService: Service;
  #batteryService: Service;

  #lockState: number;
  #batteryLevel: number;

  getBatteryLevel(): CharacteristicValue {
    return this.#batteryLevel;
  }

  getStatusLowBattery(): CharacteristicValue {
    return this.#batteryLevel < 20;
  }

  constructor(
    private readonly platform: OpenSesame,
    private readonly accessory: PlatformAccessory,
    private readonly sesame: SesameLock,
    cognitoClient?: CognitoClient,
  ) {
    this.#client =
      cognitoClient ?? new CandyClient(platform.config.apiKey, platform.log);

    this.#mutex = new Mutex();

    this.accessory
      .getService(platform.Service.AccessoryInformation)!
      .setCharacteristic(platform.Characteristic.Manufacturer, PLATFORM_NAME)
      .setCharacteristic(platform.Characteristic.Model, "Sesame3")
      .setCharacteristic(platform.Characteristic.SerialNumber, sesame.uuid);

    this.#lockService =
      this.accessory.getService(platform.Service.LockMechanism) ??
      this.accessory.addService(platform.Service.LockMechanism);

    const name = this.sesame.name ?? this.sesame.uuid;
    this.#lockService.setCharacteristic(platform.Characteristic.Name, name);

    this.#lockService
      .getCharacteristic(platform.Characteristic.LockCurrentState)
      .onGet(this.getLockState.bind(this));

    this.#lockService
      .getCharacteristic(platform.Characteristic.LockTargetState)
      .onGet(this.getLockState.bind(this))
      .onSet(this.setLockTargetState.bind(this));

    this.#batteryService =
      this.accessory.getService(platform.Service.Battery) ??
      this.accessory.addService(platform.Service.Battery);
    this.#batteryService
      .getCharacteristic(platform.Characteristic.BatteryLevel)
      .onGet(this.getBatteryLevel.bind(this));
    this.#batteryService
      .getCharacteristic(platform.Characteristic.StatusLowBattery)
      .onGet(this.getStatusLowBattery.bind(this));

    // Start updating status
    this.updateStatus();
    this.subscribe();

    // Initialize accessory characteristics
    this.#lockState = platform.Characteristic.LockCurrentState.UNKNOWN;
    this.#batteryLevel = 100;
  }

  getLockState(): CharacteristicValue {
    return this.#lockState;
  }

  private async setLockTargetState(value: CharacteristicValue) {
    let cmd: number;
    switch (value) {
      case this.platform.Characteristic.LockCurrentState.SECURED:
        cmd = Command.lock;
        break;
      case this.platform.Characteristic.LockCurrentState.UNSECURED:
        cmd = Command.unlock;
        break;
      default:
        return;
    }

    try {
      await this.#mutex.runExclusive(async () => {
        this.#lockService
          .getCharacteristic(this.platform.Characteristic.LockTargetState)
          .updateValue(value);

        await this.#client.postCmd(this.sesame, cmd, this.platform.config.name);

        // Adjust update timing
        await sleep(1000);

        // Update state
        const CHSesame2Status =
          value == this.platform.Characteristic.LockCurrentState.SECURED
            ? "locked"
            : "unlocked";
        this.setLockStatus({ CHSesame2Status });
      });
    } catch (error) {
      const logPrefix = this.sesame.name ?? this.sesame.uuid;
      this.platform.log.error(`[${logPrefix}] ${error.message}`);

      // Mark as jammed
      this.#lockService
        .getCharacteristic(this.platform.Characteristic.LockCurrentState)
        .updateValue(this.platform.Characteristic.LockCurrentState.JAMMED);
    }
  }

  public setLockStatus({
    CHSesame2Status,
    withMutexLock = false,
  }: {
    CHSesame2Status: string;
    withMutexLock?: boolean;
  }): void {
    // In update progress.
    if (withMutexLock && this.#mutex.isLocked()) {
      return;
    }

    this.#lockState =
      CHSesame2Status === "locked"
        ? this.platform.Characteristic.LockCurrentState.SECURED
        : this.platform.Characteristic.LockCurrentState.UNSECURED;

    // Update value. This triggers home notification
    this.#lockService
      .getCharacteristic(this.platform.Characteristic.LockTargetState)
      .updateValue(this.getLockState());
    this.#lockService
      .getCharacteristic(this.platform.Characteristic.LockCurrentState)
      .updateValue(this.getLockState());
  }

  private async subscribe() {
    this.#client.subscribe(
      this.sesame,
      this.platform.config.updateInterval * 1000,
      (shadow: Sesame2Shadow) => {
        this.setLockStatus({
          CHSesame2Status: shadow.CHSesame2Status,
          withMutexLock: true,
        });
      },
    );
  }

  private async updateStatus(): Promise<void> {
    return await this.#mutex.runExclusive(async () => {
      const shadow = await this.fetchSesameShadow();

      let lockState: CharacteristicValue;
      switch (shadow.CHSesame2Status) {
        case "locked":
          lockState = this.platform.Characteristic.LockCurrentState.SECURED;
          break;
        case "unlocked":
          lockState = this.platform.Characteristic.LockCurrentState.UNSECURED;
          break;
        default:
          lockState = this.platform.Characteristic.LockCurrentState.UNKNOWN;
          break;
      }

      this.#lockState = lockState;
      this.#batteryLevel = shadow.batteryPercentage;

      // Update value. This triggers home notification
      this.#lockService
        .getCharacteristic(this.platform.Characteristic.LockTargetState)
        .updateValue(this.getLockState());
      this.#lockService
        .getCharacteristic(this.platform.Characteristic.LockCurrentState)
        .updateValue(this.getLockState());

      this.#batteryService
        .getCharacteristic(this.platform.Characteristic.BatteryLevel)
        .updateValue(this.getBatteryLevel());
      this.#batteryService
        .getCharacteristic(this.platform.Characteristic.StatusLowBattery)
        .updateValue(this.getStatusLowBattery());
    });
  }

  private async fetchSesameShadow(): Promise<Sesame2Shadow> {
    return await this.#client.getShadow(this.sesame);
  }
}
