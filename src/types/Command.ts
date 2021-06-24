export const Command = {
  lock: 82,
  unlock: 83,
  toggle: 88,
  click: 89,
};
export type Command = typeof Command[keyof typeof Command];
