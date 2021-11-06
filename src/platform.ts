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

import { Sesame3 } from "./accessories/Sesame3";
import { SesameBot } from "./accessories/SesameBot";
import {
  PLATFORM_NAME,
  PLUGIN_NAME,
  OpenSesamePlatformConfig,
} from "./settings";
import { CHDevice } from "./types/Device";

const CLIENT_ID = "ap-northeast-1:0a1820f1-dbb3-4bca-9227-2a92f6abf0ae";

export class OpenSesame implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic =
    this.api.hap.Characteristic;

  public readonly config: OpenSesamePlatformConfig;
  public readonly accessories: Array<PlatformAccessory> = [];

  constructor(
    public readonly log: Logger,
    config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug("Finished initializing platform:", config.name);

    if (!this.verifyConfig(config)) {
      this.log.debug("Invalid configuration. Please check your configuration.");

      // Dummy data to pass Strict Property Initialization
      this.config = {
        ...config,
        apiKey: "",
        clientID: "",
        interval: 60 * 60 * 1000,
        locks: [],
        bots: [],
      };
      return;
    }

    this.config = config;
    this.config.clientID = config.clientID ? config.clientID : CLIENT_ID;

    this.api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      this.log.debug("Executed didFinishLaunching callback");

      this.initializeLocks();
      this.initializeBots();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info("Loading accessory from cache:", accessory.displayName);

    const devices = (this.config.locks ?? []).concat(this.config.bots ?? []);
    const existingConfig = devices.find(
      (sesame: CHDevice) =>
        this.api.hap.uuid.generate(sesame.uuid) === accessory.UUID,
    );

    if (!existingConfig) {
      this.api.on("didFinishLaunching", () => {
        this.log.info(
          "Removing existing accessory from cache:",
          accessory.displayName,
        );

        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ]);
      });
      return;
    }

    this.accessories.push(accessory);
  }

  private verifyConfig(
    config: PlatformConfig | OpenSesamePlatformConfig,
  ): config is OpenSesamePlatformConfig {
    if (!["apiKey"].every((key: string) => key in config)) {
      return false;
    }

    if (typeof config.locks !== "undefined" && !Array.isArray(config.locks)) {
      return false;
    }

    if (typeof config.bots !== "undefined" && !Array.isArray(config.bots)) {
      return false;
    }

    if (
      Array.isArray(config.locks) &&
      config.locks.some(
        (lock: CHDevice) =>
          typeof lock.uuid === "undefined" || lock.uuid.length <= 1,
      )
    ) {
      return false;
    }

    if (
      Array.isArray(config.bots) &&
      config.bots.some(
        (bot: CHDevice) =>
          typeof bot.uuid === "undefined" || bot.uuid.length <= 1,
      )
    ) {
      return false;
    }

    return true;
  }

  private initializeLocks() {
    const sesameLocks: Array<CHDevice> = this.config.locks ?? [];

    for (const sesame of sesameLocks) {
      const uuid = this.api.hap.uuid.generate(sesame.uuid);
      const existingAccessory = this.accessories.find(
        (accessory) => accessory.UUID === uuid,
      );

      if (existingAccessory) {
        this.log.info(
          "Restoring existing accessory from cache:",
          existingAccessory.displayName,
        );
        new Sesame3(this, existingAccessory, sesame);
      } else {
        this.log.info("Adding new accessory:", sesame.uuid);

        const name = sesame.name ?? sesame.uuid;
        const accessory = new this.api.platformAccessory(name, uuid);
        new Sesame3(this, accessory, sesame);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ]);
      }
    }
  }

  private initializeBots() {
    const sesameBots: Array<CHDevice> = this.config.bots ?? [];

    for (const sesame of sesameBots) {
      const uuid = this.api.hap.uuid.generate(sesame.uuid);
      const existingAccessory = this.accessories.find(
        (accessory) => accessory.UUID === uuid,
      );

      if (existingAccessory) {
        this.log.info(
          "Restoring existing accessory from cache:",
          existingAccessory.displayName,
        );
        new SesameBot(this, existingAccessory, sesame);
      } else {
        this.log.info("Adding new accessory:", sesame.uuid);

        const name = sesame.name ?? sesame.uuid;
        const accessory = new this.api.platformAccessory(name, uuid);
        new SesameBot(this, accessory, sesame);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ]);
      }
    }
  }
}
