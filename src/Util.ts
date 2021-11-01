import { Sesame3 } from "./accessories/Sesame3";
import { SesameBot } from "./accessories/SesameBot";
import { CHSesame2MechStatus } from "./types/API";

/** Sleep function
- * @example
- * // sleeps 3 seconds
- * await sleep(3000);
- */
function sleep(msec: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, msec));
}

function convertToSesame2MechStatus(
  deviceType: typeof Sesame3 | typeof SesameBot,
  mechst: string,
): CHSesame2MechStatus {
  const data = Uint8Array.from(Buffer.from(mechst, "hex"));

  let voltages: Array<number>;
  let percentages: Array<number>;
  let voltage: number;
  let position: number;
  let target: number;

  switch (deviceType) {
    case SesameBot:
      voltages = [3.0, 2.9, 2.85, 2.8, 2.7, 2.6, 2.55, 2.5, 2.4, 2.3];
      percentages = [100.0, 50.0, 40.0, 32.0, 21.0, 13.0, 10.0, 7.0, 3.0, 0.0];
      voltage = (Buffer.from(data.slice(0, 2)).readUIntLE(0, 2) * 3.6) / 1023;
      position = 0;
      target = 0;
      break;
    default:
      voltages = [6.0, 5.8, 5.7, 5.6, 5.4, 5.2, 5.1, 5.0, 4.8, 4.6];
      percentages = [100.0, 50.0, 40.0, 32.0, 21.0, 13.0, 10.0, 7.0, 3.0, 0.0];
      voltage = (Buffer.from(data.slice(0, 2)).readUIntLE(0, 2) * 7.2) / 1023;
      position = Buffer.from(data.slice(4, 6)).readUIntLE(0, 2);
      target = Buffer.from(data.slice(2, 4)).readUIntLE(0, 2);
      break;
  }

  let percentage =
    voltage > voltages[0] ? 100 : voltage < voltages.slice(-1)[0] ? 0 : -1;
  if (percentage === -1) {
    let i = 0;
    while (i < voltages.length - 1) {
      if (voltage > voltages[i] || voltage <= voltages[i + 1]) {
        i = i + 1;
        continue;
      } else {
        const f = (voltage - voltages[i + 1]) / (voltages[i] - voltages[i + 1]);
        const f3 = percentages[i];
        const f4 = percentages[i + 1];
        percentage = f4 + f * (f3 - f4);
        break;
      }
    }
  }

  return {
    batteryPercentage: percentage,
    batteryVoltage: voltage,
    isBatteryCritical: (data[7] & 32) > 0,
    CHSesame2Status: undefined,
    isInLockRange: (data[7] & 2) > 0,
    isInUnlockRange: (data[7] & 4) > 0,
    position: position,
    target: target,
  };
}

export { sleep, convertToSesame2MechStatus };
