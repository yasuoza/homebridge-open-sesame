import { Mutex } from "async-mutex";
import {
  APIEvent,
  Service,
  PlatformAccessory,
  CharacteristicValue,
} from "homebridge";

import { CognitoClient } from "../CognitoClient";
import { OpenSesame } from "../platform";
import { PLATFORM_NAME } from "../settings";
import { Sesame2Shadow } from "../types/API";
import { Command } from "../types/Command";
import { CHDevice } from "../types/Device";

export class Sesame3 {
  readonly #client: CognitoClient;
  readonly #mutex: Mutex;

  readonly #lockService: Service;
  readonly #batteryService: Service;

  #lockState: number;
  #batteryLevel: number;

  constructor(
    private readonly platform: OpenSesame,
    private readonly accessory: PlatformAccessory,
    private readonly sesame: CHDevice,
  ) {
    this.#client = new CognitoClient(
      Sesame3,
      this.sesame,
      this.platform.config.apiKey,
      this.platform.config.clientID,
      this.platform.log,
    );

    this.platform.api.on(APIEvent.SHUTDOWN, () => {
      this.#client.shutdown();
    });

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
    this.updateToLatestStatus();
    this.subscribe();

    // Initialize accessory characteristics
    this.#lockState = platform.Characteristic.LockCurrentState.UNKNOWN;
    this.#batteryLevel = 100;
  }

  private getBatteryLevel(): CharacteristicValue {
    return this.#batteryLevel;
  }

  private getStatusLowBattery(): CharacteristicValue {
    return this.#batteryLevel < 20;
  }

  private getLockState(): CharacteristicValue {
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

        await this.#client.postCmd(cmd, this.platform.config.name);
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

  private setLockStatus({
    CHSesame2Status,
    batteryPercentage,
  }: {
    CHSesame2Status: string;
    batteryPercentage: number;
  }): void {
    // Update lock service
    this.#lockState =
      CHSesame2Status === "locked"
        ? this.platform.Characteristic.LockCurrentState.SECURED
        : this.platform.Characteristic.LockCurrentState.UNSECURED;
    this.#lockService
      .getCharacteristic(this.platform.Characteristic.LockCurrentState)
      .updateValue(this.getLockState());

    // Update battery service
    this.#batteryLevel = batteryPercentage;
    this.#batteryService
      .getCharacteristic(this.platform.Characteristic.BatteryLevel)
      .updateValue(this.getBatteryLevel());
    this.#batteryService
      .getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .updateValue(this.getStatusLowBattery());
  }

  private async updateToLatestStatus(): Promise<void> {
    const shadow = await this.#client.getShadow();
    this.setLockStatus({
      CHSesame2Status: shadow.CHSesame2Status,
      batteryPercentage: shadow.batteryPercentage,
    });
  }

  private async subscribe() {
    this.#client.subscribe((shadow: Sesame2Shadow) => {
      this.setLockStatus({
        CHSesame2Status: shadow.CHSesame2Status,
        batteryPercentage: shadow.batteryPercentage,
      });
    });
  }
}
