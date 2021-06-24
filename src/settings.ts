import { PlatformConfig } from "homebridge";

import { CHDevice } from "./types/Device";

/**
 * This is the name of the platform that users will use to register the plugin in the Homebridge config.json
 */
export const PLATFORM_NAME = "OpenSesame";

/**
 * This must match the name of your plugin as defined the package.json
 */
export const PLUGIN_NAME = "homebridge-open-sesame";

//Config
export interface OpenSesamePlatformConfig extends PlatformConfig {
  apiKey: string;
  clientID: string;
  locks: Array<CHDevice> | undefined;
  bots: Array<CHDevice> | undefined;
}
