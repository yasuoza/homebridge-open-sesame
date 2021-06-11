import { Mutex } from "async-mutex";
import { Service, PlatformAccessory, CharacteristicValue } from "homebridge";

import { Client, Command } from "../Client";
import { OpenSesame } from "../platform";
import { PLATFORM_NAME, SesameLock } from "../settings";

export class Sesame3 {
  #client: Client;
  #mutex: Mutex;
  #lockService: Service;

  constructor(
    private readonly platform: OpenSesame,
    private readonly accessory: PlatformAccessory,
    private readonly sesame: SesameLock,
  ) {
    this.#client = new Client(platform.config.apiKey, this.platform.log);
    this.#mutex = new Mutex();

    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, PLATFORM_NAME)
      .setCharacteristic(this.platform.Characteristic.Model, "Sesame3")
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.sesame.uuid);

    this.#lockService =
      this.accessory.getService(this.platform.Service.LockMechanism) ??
      this.accessory.addService(this.platform.Service.LockMechanism);

    const name = this.sesame.name ?? this.sesame.uuid;
    this.#lockService.setCharacteristic(this.platform.Characteristic.Name, name);

    this.#lockService
      .getCharacteristic(this.platform.Characteristic.LockCurrentState)
      .onGet(this.getLockState.bind(this));

    this.#lockService
      .getCharacteristic(this.platform.Characteristic.LockTargetState)
      .onGet(this.getLockState.bind(this))
      .onSet(this.setLockTargetState.bind(this));

    const battery =
      this.accessory.getService(this.platform.Service.Battery) ??
      this.accessory.addService(this.platform.Service.Battery);
    battery.getCharacteristic(this.platform.Characteristic.BatteryLevel).onGet(this.getBatteryLevel.bind(this));
    battery.getCharacteristic(this.platform.Characteristic.StatusLowBattery).onGet(this.getStatusLowBattery.bind(this));
  }

  async getLockState(): Promise<CharacteristicValue> {
    let lockState: CharacteristicValue;
    const release = await this.#mutex.acquire();
    try {
      const shadow = await this.#client.getShadow(this.sesame.uuid);

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
      return lockState;
    } finally {
      release();
    }
  }

  // TODO: Implement setLockTargetState after API comes.
  async setLockTargetState(value: CharacteristicValue) {
    const release = await this.#mutex.acquire();

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
      await this.#client.postCmd(this.sesame.uuid, cmd);

      // Update state
      this.#lockService.getCharacteristic(this.platform.Characteristic.LockCurrentState).updateValue(value);
    } catch (e) {
      this.platform.log.error(e);

      // rollback
      const currentLockState = await this.getLockState();
      this.#lockService.getCharacteristic(this.platform.Characteristic.LockCurrentState).updateValue(currentLockState);
    } finally {
      release();
    }
  }

  async getBatteryLevel(): Promise<CharacteristicValue> {
    const release = await this.#mutex.acquire();
    try {
      const shadow = await this.#client.getShadow(this.sesame.uuid);
      return shadow.batteryPercentage;
    } finally {
      release();
    }
  }

  async getStatusLowBattery(): Promise<CharacteristicValue> {
    const release = await this.#mutex.acquire();
    try {
      const shadow = await this.#client.getShadow(this.sesame.uuid);
      if (shadow.batteryPercentage < 20) {
        return this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
      }
      return this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    } finally {
      release();
    }
  }
}
