import { Mutex } from "async-mutex";
import { Service, PlatformAccessory, CharacteristicValue } from "homebridge";

import { Client, Command } from "../Client";
import { OpenSesame } from "../platform";
import { PLATFORM_NAME, SesameLock } from "../settings";
import { Sesame2Shadow } from "../types/API";

export class Sesame3 {
  #client: Client;
  #mutex: Mutex;

  #lockService: Service;

  #lockState: number;
  #batteryLevel: number;

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

    // Start updating status
    setInterval(async () => {
      if (this.#mutex.isLocked()) {
        return;
      }

      await this.#mutex.runExclusive(async () => {
        await this.updateStatus();
      });
    }, this.platform.updateInterval);

    // Initialize accessory characteristics
    this.#lockState = this.platform.Characteristic.LockCurrentState.UNKNOWN;
    this.#batteryLevel = 100;
  }

  async getLockState(): Promise<CharacteristicValue> {
    return this.#lockState;
  }

  // TODO: Implement setLockTargetState after API comes.
  async setLockTargetState(value: CharacteristicValue) {
    const currentLockState = this.#lockState;

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
        await this.#client.postCmd(this.sesame.uuid, cmd);

        // Update state
        this.#lockState = value;
        this.#lockService.getCharacteristic(this.platform.Characteristic.LockCurrentState).updateValue(value);
      });
    } catch (e) {
      this.platform.log.error(e);

      // rollback
      this.#lockService.getCharacteristic(this.platform.Characteristic.LockCurrentState).updateValue(currentLockState);
    }
  }

  getBatteryLevel(): CharacteristicValue {
    return this.#batteryLevel;
  }

  getStatusLowBattery(): CharacteristicValue {
    return this.#batteryLevel < 20;
  }

  private async updateStatus(): Promise<void> {
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
  }

  private async fetchSesameShadow(): Promise<Sesame2Shadow> {
    return await this.#mutex.runExclusive(async () => {
      return await this.#client.getShadow(this.sesame.uuid);
    });
  }
}
