export type CHSesame2MechStatus = {
  batteryVoltage: number;
  batteryPercentage: number;
  isBatteryCritical: boolean;
  isInLockRange: boolean;
  isInUnlockRange: boolean;
  position: number;
  target: number;
};
