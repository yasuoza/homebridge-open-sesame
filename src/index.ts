import { API } from "homebridge";

import { OpenSesame } from "./platform";
import { PLATFORM_NAME } from "./settings";

/**
 * This method registers the platform with Homebridge
 */
export = (api: API) => {
  api.registerPlatform(PLATFORM_NAME, OpenSesame);
};
