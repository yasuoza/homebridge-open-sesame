/* Sesame2 Shadow API Response
 *
 * @example
 *  {
 *    "batteryPercentage":94,             // 電池残量94%
 *    "batteryVoltage":5.869794721407625, // 電池の電圧, 単位: ボルト(V)
 *    "position":11,                      // セサミデバイスの角度, 360˚ は 1024
 *    "CHSesame2Status":"locked",         // locked, unlocked, moved 三種類のみ
 *    "timestamp":1598523693              // Sesame2 Shadow が更新された時間。 1970/1/1 00:00:00 から秒単位のタイムスタンプ
 *  }
 *
 */
export type Sesame2Shadow = {
  batteryPercentage: number;
  batteryVoltage: number;
  position: number;
  CHSesame2Status: "locked" | "unlocked" | "moved";
  timestamp: number; // epoch time
};
