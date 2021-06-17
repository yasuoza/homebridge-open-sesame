export const Command = {
  lock: 82,
  unlock: 83,
};
export type Command = typeof Command[keyof typeof Command];
