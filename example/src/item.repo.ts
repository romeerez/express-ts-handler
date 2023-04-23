import { Item } from './server';

const items: Item[] = [];

export const findItemById = async (id: number) => {
  return items.find((it) => it.id === id);
};

export const searchItemsByName = async (name: string) => {
  return items.filter((it) => it.name === name);
};

export const createItem = async (data: Omit<Item, 'id'>) => {
  const item = { ...data, id: items.length + 1 };
  items.push(item);
  return item;
};
