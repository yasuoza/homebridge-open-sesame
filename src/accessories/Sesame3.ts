import { Mutex } from "async-mutex";
import { Service, PlatformAccessory, CharacteristicValue } from "homebridge";

import { Client, Command } from "../Client";
import { OpenSesame } from "../platform";
import { PLATFORM_NAME } from "../settings";
import { Sesame2Shadow } from "../types/API";
import { SesameLock } from "../types/Device";

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
    this.#client = new Client(platform.config.apiKey, platform.log);
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

    const battery =
      this.accessory.getService(platform.Service.Battery) ??
      this.accessory.addService(platform.Service.Battery);
    battery
      .getCharacteristic(platform.Characteristic.BatteryLevel)
      .onGet(this.getBatteryLevel.bind(this));
    battery
      .getCharacteristic(platform.Characteristic.StatusLowBattery)
      .onGet(this.getStatusLowBattery.bind(this));

    // Start updating status
    this.updateStatus();
    setInterval(async () => {
      await this.updateStatus();
    }, platform.config.updateInterval * 1000);

    // Initialize accessory characteristics
    this.#lockState = platform.Characteristic.LockCurrentState.UNKNOWN;
    this.#batteryLevel = 100;
  }

  async getLockState(): Promise<CharacteristicValue> {
    return this.#lockState;
  }

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
        await this.#client.postCmd(this.sesame, cmd);

        // Update state
        this.#lockState = value;
        this.#lockService
          .getCharacteristic(this.platform.Characteristic.LockCurrentState)
          .updateValue(value);
      });
    } catch (e) {
      this.platform.log.error(e);

      // rollback
      this.#lockService
        .getCharacteristic(this.platform.Characteristic.LockCurrentState)
        .updateValue(currentLockState);
    }
  }

  getBatteryLevel(): CharacteristicValue {
    return this.#batteryLevel;
  }

  getStatusLowBattery(): CharacteristicValue {
    return this.#batteryLevel < 20;
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
    });
  }

  private async fetchSesameShadow(): Promise<Sesame2Shadow> {
    return await this.#client.getShadow(this.sesame);
  }
}
