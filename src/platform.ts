import {
  API,
  APIEvent,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from "homebridge";

import { Sesame3 } from "./devices/Sesame3";
import { PLATFORM_NAME, PLUGIN_NAME, SesameLock } from "./settings";

export class OpenSesame implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  public readonly accessories: PlatformAccessory[] = [];

  // Status update interval
  get updateInterval(): number {
    return this.config?.updateInterval ?? 60;
  }

  constructor(public readonly log: Logger, public readonly config: PlatformConfig, public readonly api: API) {
    this.log.debug("Finished initializing platform:", this.config.name);

    // Configuration is required.
    if (typeof this.config === "undefined") {
      return;
    }

    this.api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      this.log.debug("Executed didFinishLaunching callback");

      this.initializeSesameLocks();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info("Loading accessory from cache:", accessory.displayName);

    const existingConfig = this.config.locks.find(
      (sesame: SesameLock) => this.api.hap.uuid.generate(sesame.uuid) === accessory.UUID,
    );
    if (!existingConfig) {
      this.api.on("didFinishLaunching", () => {
        this.log.info("Removing existing accessory from cache:", accessory.displayName);

        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      });
      return;
    }

    this.accessories.push(accessory);
  }

  initializeSesameLocks() {
    const sesameLocks: [SesameLock] = this.config.locks;

    for (const sesame of sesameLocks) {
      const uuid = this.api.hap.uuid.generate(sesame.uuid);
      const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
      if (existingAccessory) {
        this.log.info("Restoring existing accessory from cache:", existingAccessory.displayName);

        new Sesame3(this, existingAccessory, sesame);
      } else {
        this.log.info("Adding new accessory:", sesame.uuid);

        const name = sesame.name ?? sesame.uuid;
        const accessory = new this.api.platformAccessory(name, uuid);
        new Sesame3(this, accessory, sesame);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}
