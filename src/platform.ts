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

import { CognitoClient } from "./CognitoClient";
import { Server } from "./Server";
import { Sesame3 } from "./accessories/Sesame3";
import {
  PLATFORM_NAME,
  PLUGIN_NAME,
  OpenSesamePlatformConfig,
} from "./settings";
import { SesameLock } from "./types/Device";

export class OpenSesame implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic =
    this.api.hap.Characteristic;

  public readonly config: OpenSesamePlatformConfig;
  public readonly accessories: Array<PlatformAccessory> = [];

  #server: Server | undefined;

  #cognitoClient: CognitoClient | undefined;

  constructor(
    public readonly log: Logger,
    config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug("Finished initializing platform:", config.name);

    if (!this.verifyConfig(config)) {
      // Dummy data to pass Strict Property Initialization
      this.config = {
        ...config,
        apiKey: "",
        clientID: "",
        locks: [],
        updateInterval: Number.POSITIVE_INFINITY,
      };
      return;
    }

    this.config = config;

    if (typeof this.config.webhookPort === "number") {
      this.log.info(
        `Webhook server is listening on ${this.config.webhookPort}`,
      );

      this.#server = new Server(this.config.webhookPort);
    }

    this.api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      this.log.debug("Executed didFinishLaunching callback");

      if (this.config.clientID.trim()) {
        this.log.info("Client ID detected. Using MQTT connection.");

        this.#cognitoClient = new CognitoClient(
          this.config.apiKey,
          this.config.clientID,
          log,
        );
      }

      this.initializeSesameLocks();
      this.#server?.listen();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info("Loading accessory from cache:", accessory.displayName);

    const existingConfig = this.config.locks.find(
      (sesame: SesameLock) =>
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
    return ["apiKey", "clientID", "locks", "updateInterval"].every(
      (key: string) => key in config,
    );
  }

  private initializeSesameLocks() {
    const sesameLocks: Array<SesameLock> = this.config.locks;

    for (const sesame of sesameLocks) {
      const uuid = this.api.hap.uuid.generate(sesame.uuid);
      const existingAccessory = this.accessories.find(
        (accessory) => accessory.UUID === uuid,
      );

      let sesame3: Sesame3;
      if (existingAccessory) {
        this.log.info(
          "Restoring existing accessory from cache:",
          existingAccessory.displayName,
        );
        sesame3 = new Sesame3(
          this,
          existingAccessory,
          sesame,
          this.#cognitoClient!,
        );
      } else {
        this.log.info("Adding new accessory:", sesame.uuid);

        const name = sesame.name ?? sesame.uuid;
        const accessory = new this.api.platformAccessory(name, uuid);
        sesame3 = new Sesame3(this, accessory, sesame, this.#cognitoClient!);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ]);
      }

      this.#server?.locks.set(sesame.uuid.toUpperCase(), sesame3);
    }
  }
}
