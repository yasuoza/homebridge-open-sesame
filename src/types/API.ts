export type CHSesame2MechStatus = {
  batteryVoltage: number;
  batteryPercentage: number;
  isBatteryCritical: boolean;
  CHSesame2Status: string | undefined;
  isInLockRange: boolean;
  isInUnlockRange: boolean;
  position: number;
  target: number;
};
