export const ADDR = {
  text: '/virtualbot/text',
  expression: {
    eyes: '/virtualbot/expression/eyes',
    mouth: '/virtualbot/expression/mouth',
  },
  lamp: {
    state: '/virtualbot/lamp/state',
    brightness: '/virtualbot/lamp/brightness',
    temperature: '/virtualbot/lamp/temperature',
  },
  arm: {
    position: '/virtualbot/arm/position',
    grab: '/virtualbot/arm/grab',
    contact: {
      meta: '/virtualbot/arm/contact/meta',
      grabbed: '/virtualbot/arm/contact/grabbed',
    },
  },
  pose: {
    position: '/virtualbot/position',
    rotation: '/virtualbot/rotation',
  },
} as const;

export type AddressBook = typeof ADDR;
