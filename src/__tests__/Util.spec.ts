import * as Util from "../Util";
import { Sesame3 } from "../accessories/Sesame3";

describe("Util", () => {
  describe("convertToSesame2MechStatus", () => {
    test("locked mechst", () => {
      const mechst = "6103f3ff8700000a";
      const data = Util.convertToSesame2MechStatus(Sesame3, mechst);

      expect(data.batteryPercentage).toEqual(100);
      expect(data.batteryVoltage).toEqual(6.087976539589443);
      expect(data.isInLockRange).toBeTruthy();
      expect(data.isInUnlockRange).toBeFalsy();
      expect(data.position).toEqual(135);
      expect(data.target).toEqual(65523);
    });

    test("unlocked mechst", () => {
      const mechst = "5e031503e3020004";
      const data = Util.convertToSesame2MechStatus(Sesame3, mechst);

      expect(data.batteryPercentage).toEqual(100);
      expect(data.batteryVoltage).toEqual(6.066862170087977);
      expect(data.isInLockRange).toBeFalsy();
      expect(data.isInUnlockRange).toBeTruthy();
      expect(data.position).toEqual(739);
      expect(data.target).toEqual(789);
    });
  });
});
