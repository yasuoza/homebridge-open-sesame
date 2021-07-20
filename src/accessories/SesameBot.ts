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
import { CHSesame2MechStatus } from "../types/API";
import { Command } from "../types/Command";
import { CHDevice } from "../types/Device";

export class SesameBot {
  readonly #client: CognitoClient;
  readonly #mutex: Mutex;

  readonly #switchService: Service;
  readonly #batteryService: Service;
  #batteryCritical: boolean;

  #on: CharacteristicValue;
  #batteryLevel: number;

  constructor(
    private readonly platform: OpenSesame,
    private readonly accessory: PlatformAccessory,
    private readonly bot: CHDevice,
  ) {
    this.#client = new CognitoClient(
      SesameBot,
      this.bot,
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
      .setCharacteristic(platform.Characteristic.Model, "Sesame Bot")
      .setCharacteristic(platform.Characteristic.SerialNumber, bot.uuid);

    this.#switchService =
      accessory.getService(this.platform.Service.Switch) ??
      accessory.addService(this.platform.Service.Switch);

    const name = this.bot.name ?? this.bot.uuid;
    this.#switchService.setCharacteristic(platform.Characteristic.Name, name);

    this.#switchService
      .getCharacteristic(platform.Characteristic.On)
      .onGet(this.getOn.bind(this))
      .onSet(this.setOn.bind(this));

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

    this.#on = 0;
    this.#batteryLevel = 100;
    this.#batteryCritical = false;
  }

  private getOn(): CharacteristicValue {
    return this.#on;
  }

  private async setOn(_: CharacteristicValue): Promise<void> {
    try {
      await this.#mutex.runExclusive(async () => {
        await this.#client.postCmd(Command.click, this.platform.config.name);

        // Ensure the status to be off.
        // Circle action does not update iot status.
        setTimeout(() => {
          this.#on = false;
          this.#switchService.updateCharacteristic(
            this.platform.Characteristic.On,
            false,
          );
        }, 3.5 * 1000);
      });
    } catch (error) {
      const logPrefix = this.bot.name ?? this.bot.uuid;
      this.platform.log.error(`[${logPrefix}] ${error.message}`);
    }
  }

  private getBatteryLevel(): CharacteristicValue {
    return this.#batteryLevel;
  }

  private getStatusLowBattery(): CharacteristicValue {
    return this.#batteryLevel < 20;
  }

  private setSwitchStatus(status: CHSesame2MechStatus): void {
    // Update lock service
    this.#on = status.isInLockRange;
    this.#switchService
      .getCharacteristic(this.platform.Characteristic.On)
      .updateValue(this.getOn());

    // Update battery service
    this.#batteryLevel = status.batteryPercentage;
    this.#batteryCritical = status.isBatteryCritical;
    this.#batteryService
      .getCharacteristic(this.platform.Characteristic.BatteryLevel)
      .updateValue(this.getBatteryLevel());
    this.#batteryService
      .getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .updateValue(this.getStatusLowBattery());
  }

  private async updateToLatestStatus(): Promise<void> {
    const status = await this.#client.getMechStatus();

    this.setSwitchStatus(status);
  }

  private subscribe() {
    this.#client.subscribe((status: CHSesame2MechStatus) => {
      this.setSwitchStatus(status);
    });
  }
}
