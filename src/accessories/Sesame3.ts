import { Mutex } from "async-mutex";
import {
  APIEvent,
  Service,
  PlatformAccessory,
  CharacteristicValue,
} from "homebridge";

import { CandyClient } from "../CandyClient";
import { CognitoClient } from "../CognitoClient";
import * as Util from "../Util";
import { Client } from "../interfaces/Client";
import { OpenSesame } from "../platform";
import { PLATFORM_NAME } from "../settings";
import { CHSesame2MechStatus } from "../types/API";
import { Command } from "../types/Command";
import { CHDevice } from "../types/Device";

export class Sesame3 {
  readonly #client: Client;
  readonly #mutex: Mutex;

  readonly #lockService: Service;
  readonly #batteryService: Service;

  #lockState: number;
  #batteryLevel: number;
  #batteryCritical: boolean;

  constructor(
    private readonly platform: OpenSesame,
    private readonly accessory: PlatformAccessory,
    private readonly sesame: CHDevice,
  ) {
    if (
      typeof this.platform.config.clientID != "undefined" &&
      this.platform.config.clientID != ""
    ) {
      this.platform.log.debug("CLIENT_ID is deteted. Using CognitoClient");

      this.#client = new CognitoClient(
        Sesame3,
        this.sesame,
        this.platform.config.apiKey,
        this.platform.config.clientID,
        this.platform.log,
      );
    } else {
      this.platform.log.debug("CLIENT_ID is not deteted. Using CandyClient");

      this.#client = new CandyClient(
        this.sesame,
        this.platform.config.apiKey,
        this.platform.config.interval ?? 60 * 60,
        this.platform.log,
      );
    }

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
    this.#lockState = platform.Characteristic.LockCurrentState.SECURED;
    this.#batteryLevel = 100;
    this.#batteryCritical = false;
  }

  private getBatteryLevel(): CharacteristicValue {
    return this.#batteryLevel;
  }

  private getStatusLowBattery(): CharacteristicValue {
    return this.#batteryCritical;
  }

  private getLockState(): CharacteristicValue {
    return this.#lockState;
  }

  private get isWebAPIMode(): boolean {
    return this.#client instanceof CandyClient;
  }

  private async setLockTargetState(value: CharacteristicValue) {
    const deviceName = this.sesame.name ?? this.sesame.uuid;

    let cmd: number;
    switch (value) {
      case this.platform.Characteristic.LockCurrentState.SECURED:
        cmd = Command.lock;
        this.platform.log.info(
          `Sending request for ${deviceName} to API. cmd: locked(${cmd})`,
        );
        break;
      case this.platform.Characteristic.LockCurrentState.UNSECURED:
        cmd = Command.unlock;
        this.platform.log.info(
          `Sending request for ${deviceName} to API. cmd: unlocked(${cmd})`,
        );
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

        // Using CognitoClient, we don't need update manually.
        // Updating status will be done by mqtt subscription.
        // While CandyClient delays until next updateStatus occurs.
        // So, update status for CandyClient only.
        if (this.isWebAPIMode) {
          // Adjust update timing
          await Util.sleep(2.5 * 1000);

          // Update state
          this.updateToLatestStatus();
        }
      });
    } catch (error) {
      if (error instanceof Error) {
        this.platform.log.error(`${deviceName} - ${error.message}`);
      }
      this.platform.log.debug(`${error}`);

      // Mark as jammed
      this.#lockService
        .getCharacteristic(this.platform.Characteristic.LockCurrentState)
        .updateValue(this.platform.Characteristic.LockCurrentState.JAMMED);
    }
  }

  private setLockStatus(status: CHSesame2MechStatus): void {
    // locked xor unlocked
    if (status.isInLockRange === status.isInUnlockRange) {
      return;
    }

    const currentLockState = this.#lockState;
    const newLockState = status.isInLockRange
      ? this.platform.Characteristic.LockCurrentState.SECURED
      : this.platform.Characteristic.LockCurrentState.UNSECURED;

    if (newLockState === currentLockState) {
      return;
    }

    const logPrefix = this.sesame.name ?? this.sesame.uuid;
    this.platform.log.info(
      `${logPrefix} - Current state: ${newLockState ? "Locked" : "Unlocked"}`,
    );

    this.#lockState = newLockState;
    this.#batteryLevel = status.batteryPercentage;
    this.#batteryCritical = status.isBatteryCritical;

    // Update lock service
    this.#lockService
      .getCharacteristic(this.platform.Characteristic.LockTargetState)
      .updateValue(this.getLockState());
    this.#lockService
      .getCharacteristic(this.platform.Characteristic.LockCurrentState)
      .updateValue(this.getLockState());

    // Update battery service
    this.#batteryService
      .getCharacteristic(this.platform.Characteristic.BatteryLevel)
      .updateValue(this.getBatteryLevel());
    this.#batteryService
      .getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .updateValue(this.getStatusLowBattery());
  }

  private async updateToLatestStatus(): Promise<void> {
    const status = await this.#client.getMechStatus();
    if (typeof status !== "undefined") {
      this.setLockStatus(status);
    }
  }

  private async subscribe() {
    this.#client.subscribe((status: CHSesame2MechStatus) => {
      this.setLockStatus(status);
    });
  }
}
